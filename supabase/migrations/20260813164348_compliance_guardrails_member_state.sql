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
-- Part 3 of 4: the state a member controls, and the one read that reports it.

-- ============================================================
-- 7. Setting the state a member controls
-- ============================================================

-- The age attestation. One question, answered once, stored as the answer plus
-- the threshold it was answered against.
--
-- It takes no boolean from the caller on purpose. A route that reached this
-- function has already established that the member said yes; a false would mean
-- "record that they said no", and recording a refusal as a stored fact would
-- turn a question a member may reconsider into a mark on their account.
create or replace function public.commerce_attest_age(
  p_profile_id uuid,
  p_minimum integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.member_commerce_limits;
begin
  insert into public.member_commerce_limits (
    profile_id, age_attested_at, age_attested_minimum, age_verification_method
  )
  values (p_profile_id, now(), p_minimum, 'self')
  on conflict (profile_id) do update
    set age_attested_at = now(),
        age_attested_minimum = p_minimum,
        age_verification_method = 'self',
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'age_attested_at', v_row.age_attested_at,
    'age_attested_minimum', v_row.age_attested_minimum
  );
end;
$$;

-- The member set cap, and the asymmetry that makes it a limit.
--
-- Lowering, or setting one for the first time, takes effect at once. Raising
-- one, or clearing it entirely (which is a raise to infinity and is treated as
-- one), waits p_delay_hours. Until then the lower cap is still enforced, and
-- the pending value is visible so nobody is surprised by their own decision.
create or replace function public.commerce_set_self_cap(
  p_profile_id uuid,
  p_cap_minor integer,
  p_delay_hours integer,
  p_realm_cap_minor integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.member_commerce_limits;
  v_current integer;
  v_is_raise boolean;
begin
  if p_cap_minor is not null and (p_cap_minor < 0 or p_cap_minor > p_realm_cap_minor) then
    -- A self cap above the realm's does nothing but mislead: the realm's would
    -- bite first and the member would believe they had chosen a higher one.
    raise exception 'commerce_set_self_cap: a self cap must be between 0 and the realm cap of %', p_realm_cap_minor;
  end if;

  v_row := public.commerce_limits_locked(p_profile_id);
  v_current := v_row.self_cap_minor;

  -- No cap set yet means the realm's cap is what is in force, so any named cap
  -- is a lowering. Clearing a cap is a raise. Everything else compares.
  v_is_raise := case
    when p_cap_minor is null then v_current is not null
    when v_current is null then false
    else p_cap_minor > v_current
  end;

  if v_is_raise then
    update public.member_commerce_limits
       set pending_self_cap_minor = coalesce(p_cap_minor, p_realm_cap_minor),
           pending_self_cap_at = now() + make_interval(hours => p_delay_hours),
           updated_at = now()
     where profile_id = p_profile_id
     returning * into v_row;
  else
    update public.member_commerce_limits
       set self_cap_minor = p_cap_minor,
           pending_self_cap_minor = null,
           pending_self_cap_at = null,
           updated_at = now()
     where profile_id = p_profile_id
     returning * into v_row;
  end if;

  return jsonb_build_object(
    'ok', true,
    'self_cap_minor', v_row.self_cap_minor,
    'pending_self_cap_minor', v_row.pending_self_cap_minor,
    'pending_self_cap_at', v_row.pending_self_cap_at,
    'delayed', v_is_raise
  );
end;
$$;

-- The acknowledgement. The member is recorded as having seen the number THIS
-- FUNCTION computed, not a number the client sent, so the row is evidence of
-- what they were actually shown rather than of what they claimed to have seen.
-- The route has no way to pass a total and must not be given one.
create or replace function public.commerce_acknowledge_spend(
  p_profile_id uuid,
  p_month_window_hours integer,
  p_pending_grace_minutes integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_spend integer;
begin
  v_spend := public.commerce_spend_minor(
    p_profile_id, p_month_window_hours, p_pending_grace_minutes
  );

  insert into public.member_commerce_limits (
    profile_id, acknowledged_at, acknowledged_spend_minor
  )
  values (p_profile_id, now(), v_spend)
  on conflict (profile_id) do update
    set acknowledged_at = now(),
        acknowledged_spend_minor = v_spend,
        updated_at = now();

  return jsonb_build_object(
    'ok', true, 'acknowledged_spend_minor', v_spend
  );
end;
$$;

-- Everything a member is owed about their own guardrails, in one read. The
-- surfaces render what this returns and derive nothing, so a member is never
-- shown a limit the server would not actually apply.
create or replace function public.commerce_limits_state(
  p_profile_id uuid,
  p_day_window_hours integer,
  p_month_window_hours integer,
  p_pending_grace_minutes integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.member_commerce_limits;
  v_day integer;
  v_month integer;
  v_self integer;
begin
  select * into v_row
    from public.member_commerce_limits
   where profile_id = p_profile_id;

  v_day := public.commerce_spend_minor(
    p_profile_id, p_day_window_hours, p_pending_grace_minutes
  );
  v_month := public.commerce_spend_minor(
    p_profile_id, p_month_window_hours, p_pending_grace_minutes
  );

  -- A due raise is reported as already in force even though this function is
  -- STABLE and cannot promote it. The next write promotes it for real; showing
  -- the old cap here would tell a member their raise had not landed when the
  -- very next checkout will honour it.
  v_self := case
    when v_row.pending_self_cap_at is not null and v_row.pending_self_cap_at <= now()
      then v_row.pending_self_cap_minor
    else v_row.self_cap_minor
  end;

  return jsonb_build_object(
    'age_attested_at', v_row.age_attested_at,
    'age_attested_minimum', v_row.age_attested_minimum,
    'age_verified_at', v_row.age_verified_at,
    'self_cap_minor', v_self,
    'pending_self_cap_minor',
      case when v_row.pending_self_cap_at > now() then v_row.pending_self_cap_minor end,
    'pending_self_cap_at',
      case when v_row.pending_self_cap_at > now() then v_row.pending_self_cap_at end,
    'acknowledged_at', v_row.acknowledged_at,
    'acknowledged_spend_minor', v_row.acknowledged_spend_minor,
    'day_minor', v_day,
    'month_minor', v_month
  );
end;
$$;
