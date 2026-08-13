-- COMPLIANCE GUARDRAILS, before commerce takes a dollar (mission 12).
--
-- WHY THIS EXISTS
-- Two of section 34's four answers to the gambling optics of a mystery box are
-- already built and enforced at module load: exact printed odds, validated to
-- sum to 100 in lib/collectibles/warchests.ts, and a guaranteed floor per box,
-- validated against the dealt worst case in lib/commerce/catalog.ts. The rest
-- of the posture was prose. This migration is the rest of the posture, and it
-- lands before COMMERCE_PRICES_CONFIRMED can honestly be turned on.
--
-- Five guardrails, all server enforced:
--   1. THE ALMS, a free method of entry granting a real chest.
--   2. AN AGE GATE, recorded here, gating the paid paths only.
--   3. SPEND CAPS over two rolling windows, computed from real order history.
--   4. COOLING OFF: a velocity brake, an informed consent interruption, and a
--      member set cap that lowers at once and raises only after a day.
--   5. GEO, decided in lib/commerce/geo.ts and recorded here.
--
-- NOBODY WHO WROTE THIS IS A LAWYER, and it claims compliance with no law. It
-- states what the realm enforces. lib/commerce/compliance.ts carries a "what
-- this does not cover" paragraph per guardrail, written so a real adviser can
-- read it and say what is missing.
--
-- WHY THE DECISIONS ARE HERE AND THE NUMBERS ARE NOT
-- A spend cap that is read in one round trip and written in the next is not a
-- cap. Ten concurrent checkouts each read a spend of zero and all ten pass. So
-- the check and the order insert have to be one transaction under one lock, and
-- only the database can do that. Same division of labour as public.chest_open
-- and public.craft_cards.
--
-- But every threshold below is a REQUIRED PARAMETER with no default, and that
-- is deliberate. A default here would be a second copy of a number that also
-- lives in lib/commerce/compliance.ts, and two copies of a threshold drift the
-- first time somebody tunes one of them, silently, in the direction of taking
-- more money. A required parameter cannot drift because it cannot exist in two
-- places. If a caller forgets one, the call fails loudly rather than enforcing
-- a number nobody chose.
--
-- READ BEFORE ALTERING, per supabase/migrations/README.md. One existing object
-- is altered here: chest_entitlements_source_kind_check. Its live definition was
-- read out of the database before this was written:
--
--   CHECK ((source_kind = ANY (ARRAY['order'::text, 'redemption'::text])))
--
-- which matches 20260812224950_commerce_engine.sql exactly. Repository and
-- database agree. The alteration adds 'amoe' and drops nothing. Checked, not
-- assumed.
--
-- RLS, per the standing posture: this stack authenticates with Privy, so
-- auth.uid() is always null and an owner policy would protect nothing. Both new
-- tables are deny by default with grants revoked and no policy, and ownership is
-- enforced in the routes under the service role. Every function is revoked from
-- public, anon and authenticated and granted to service_role alone, because
-- Supabase publishes every public function at /rest/v1/rpc/<name> and the anon
-- key ships in the browser bundle.
--
-- APPLIED IN FOUR PARTS, and the four files carry the names and versions
-- production recorded so the two listings read the same. See
-- supabase/migrations/README.md: filenames cannot match applied versions,
-- because a migration applied through the Supabase API is stamped server side
-- at apply time. What matters is that every applied version has a file here and
-- that the file's content is what ran.
--
--   20260813164228  compliance_guardrails_tables
--   20260813164320  compliance_guardrails_checkout_guard
--   20260813164348  compliance_guardrails_member_state
--   20260813164429  compliance_guardrails_alms_and_grants
--
-- Part 4 of 4: the Alms, then every function revoked from the browser roles.

-- ============================================================
-- 8. The Alms
-- ============================================================
--
-- THE REALM WIDE ADVISORY LOCK is the piece worth explaining. The per member
-- window is serialised by the limits row lock, the same as checkout. The realm
-- wide daily ceiling is not: two different members claiming at the same instant
-- both read a count below the ceiling and both insert, and the ceiling is
-- exceeded by exactly as many members as raced. A ceiling that can be exceeded
-- by racing is not a ceiling, and the attack is trivial to run.
--
-- So every grant takes one transaction scoped advisory lock, which serialises
-- the whole realm's alms against each other. That is a global bottleneck and it
-- is the right trade here: this path grants at most a couple of dozen rows a
-- day by construction, so the lock is uncontended in practice, and the thing it
-- protects is the only defence that holds against an attacker with many
-- accounts.
--
-- A NOTE ON WHAT IS NOT CHECKED HERE. The chapter flag is checked in the route,
-- not here, because a flag is a product state and this function is a rule. The
-- route must gate the Alms on exactly the same flag as the paid path and never
-- on a narrower one: if the chests are sealed there is nothing to be an
-- alternative to, and if they are open the free path must be open too.

create or replace function public.alms_claim(
  p_profile_id uuid,
  p_chest_sku text,
  p_window_days integer,
  p_min_account_age_days integer,
  p_daily_ceiling integer,
  p_age_minimum integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limits public.member_commerce_limits;
  v_created_at timestamptz;
  v_onboarded boolean;
  v_handle text;
  v_banned boolean;
  v_last_claim timestamptz;
  v_today_count integer;
  v_next_at timestamptz;
  v_resets_at timestamptz;
  v_entitlement uuid;
begin
  perform pg_advisory_xact_lock(hashtext('ravenspire.alms')::bigint);

  select p.created_at, p.onboarded, p.handle, p.is_banned
    into v_created_at, v_onboarded, v_handle, v_banned
    from public.profiles p
   where p.id = p_profile_id;

  if v_created_at is null then
    raise exception 'alms_claim: no such member';
  end if;

  v_limits := public.commerce_limits_locked(p_profile_id);

  -- The same age gate as the paid path. A free mystery box is still a mystery
  -- box, and the attestation costs a member one tap either way.
  if (
    v_limits.age_verified_at is null
    and (
      v_limits.age_attested_at is null
      or coalesce(v_limits.age_attested_minimum, 0) < p_age_minimum
    )
  ) then
    perform public.commerce_guard_event(
      p_profile_id, 'alms_age_gate', jsonb_build_object('minimum', p_age_minimum)
    );
    return jsonb_build_object('ok', false, 'reason', 'age_gate', 'minimum', p_age_minimum);
  end if;

  if v_banned is true then
    perform public.commerce_guard_event(p_profile_id, 'alms_banned', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  -- A real member, not a shell. Registration is free and instant, so an
  -- account age floor is the cheapest thing that turns "make a thousand
  -- accounts now" into "make a thousand accounts a week ago and keep them".
  -- It costs an honest member nothing they notice.
  if v_onboarded is not true or v_handle is null or v_handle = '' then
    return jsonb_build_object('ok', false, 'reason', 'not_onboarded');
  end if;

  if v_created_at > now() - make_interval(days => p_min_account_age_days) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'account_too_new',
      'eligible_at', v_created_at + make_interval(days => p_min_account_age_days)
    );
  end if;

  select max(created_at) into v_last_claim
    from public.chest_entitlements
   where profile_id = p_profile_id
     and source_kind = 'amoe'::text;

  if v_last_claim is not null
     and v_last_claim > now() - make_interval(days => p_window_days) then
    v_next_at := v_last_claim + make_interval(days => p_window_days);
    return jsonb_build_object(
      'ok', false, 'reason', 'already_claimed', 'next_at', v_next_at
    );
  end if;

  -- The realm wide ceiling, counted over the UTC day so it resets at a moment
  -- every member can name rather than at a rolling instant per member.
  select count(*) into v_today_count
    from public.chest_entitlements
   where source_kind = 'amoe'::text
     and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  v_resets_at := (date_trunc('day', now() at time zone 'utc') + interval '1 day')
                 at time zone 'utc';

  if v_today_count >= p_daily_ceiling then
    -- Worth recording rather than swallowing. A ceiling reached every day has
    -- stopped being a free method of entry and become a lottery for one, and
    -- this ledger is the only place that would show it.
    perform public.commerce_guard_event(
      p_profile_id, 'alms_ceiling',
      jsonb_build_object('ceiling', p_daily_ceiling, 'granted_today', v_today_count)
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'ceiling_reached', 'resets_at', v_resets_at
    );
  end if;

  insert into public.chest_entitlements (profile_id, chest_sku, source_kind, source_id)
  values (p_profile_id, p_chest_sku, 'amoe', null)
  returning id into v_entitlement;

  return jsonb_build_object(
    'ok', true,
    'entitlement_id', v_entitlement,
    'chest_sku', p_chest_sku,
    'next_at', now() + make_interval(days => p_window_days),
    'remaining_today', p_daily_ceiling - v_today_count - 1,
    'resets_at', v_resets_at
  );
end;
$$;

-- What the Alms surface needs to tell the truth before anybody presses
-- anything: whether this member may claim, when they may next, and how many the
-- realm has left to give today. Read only, so it takes no lock.
create or replace function public.alms_state(
  p_profile_id uuid,
  p_window_days integer,
  p_min_account_age_days integer,
  p_daily_ceiling integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
  v_last_claim timestamptz;
  v_today_count integer;
  v_unopened integer;
begin
  select created_at into v_created_at from public.profiles where id = p_profile_id;

  select max(created_at) into v_last_claim
    from public.chest_entitlements
   where profile_id = p_profile_id and source_kind = 'amoe'::text;

  select count(*) into v_today_count
    from public.chest_entitlements
   where source_kind = 'amoe'::text
     and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  -- Chests this member was given free and has not yet opened. Shown because a
  -- member who claimed and forgot should be told they are holding one, not
  -- shown a countdown to the next.
  select count(*) into v_unopened
    from public.chest_entitlements
   where profile_id = p_profile_id
     and source_kind = 'amoe'::text
     and opened_at is null;

  return jsonb_build_object(
    'last_claim_at', v_last_claim,
    'next_at', case
      when v_last_claim is null then null
      else v_last_claim + make_interval(days => p_window_days)
    end,
    'eligible_at', case
      when v_created_at is null then null
      else v_created_at + make_interval(days => p_min_account_age_days)
    end,
    'unopened', v_unopened,
    'remaining_today', greatest(p_daily_ceiling - v_today_count, 0),
    'resets_at',
      (date_trunc('day', now() at time zone 'utc') + interval '1 day') at time zone 'utc'
  );
end;
$$;

revoke all on function public.commerce_spend_minor(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.commerce_spend_minor(uuid, integer, integer)
  to service_role;

revoke all on function public.commerce_guard_event(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.commerce_guard_event(uuid, text, jsonb)
  to service_role;

revoke all on function public.commerce_limits_locked(uuid)
  from public, anon, authenticated;
grant execute on function public.commerce_limits_locked(uuid)
  to service_role;

revoke all on function public.commerce_checkout_guard(
  uuid, integer, text, text, text, text, text, integer, integer, integer,
  integer, integer, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.commerce_checkout_guard(
  uuid, integer, text, text, text, text, text, integer, integer, integer,
  integer, integer, integer, integer, integer, integer, integer
) to service_role;

revoke all on function public.commerce_attest_age(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.commerce_attest_age(uuid, integer)
  to service_role;

revoke all on function public.commerce_set_self_cap(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.commerce_set_self_cap(uuid, integer, integer, integer)
  to service_role;

revoke all on function public.commerce_acknowledge_spend(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.commerce_acknowledge_spend(uuid, integer, integer)
  to service_role;

revoke all on function public.commerce_limits_state(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.commerce_limits_state(uuid, integer, integer, integer)
  to service_role;

revoke all on function public.alms_claim(uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.alms_claim(uuid, text, integer, integer, integer, integer)
  to service_role;

revoke all on function public.alms_state(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.alms_state(uuid, integer, integer, integer)
  to service_role;
