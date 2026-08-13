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
-- Part 2 of 4: the shared readings and the checkout guard.

-- ============================================================
-- 5. Shared readings
-- ============================================================

-- What a member has spent inside a window, in minor units, from real orders.
--
-- WHICH ORDERS COUNT, and every clause is load bearing:
--   paid and fulfilled, always, dated by paid_at where it exists so a slow
--   webhook does not date a charge to the wrong window;
--   pending orders younger than the grace, because a pending order is a live
--   checkout the member can still complete and a cap that ignored them could
--   be walked through by opening twenty sessions before paying any;
--   never cancelled and never refunded, because that money came back.
create or replace function public.commerce_spend_minor(
  p_profile_id uuid,
  p_window_hours integer,
  p_pending_grace_minutes integer
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(o.total_minor), 0)::integer
    from public.orders o
   where o.profile_id = p_profile_id
     and o.total_minor is not null
     and (
       (
         o.status = any (array['paid'::text, 'fulfilled'::text])
         and coalesce(o.paid_at, o.created_at)
             >= now() - make_interval(hours => p_window_hours)
       )
       or (
         o.status = 'pending'::text
         and o.created_at >= now() - make_interval(mins => p_pending_grace_minutes)
       )
     );
$$;

-- Record a refusal. Its own function so that every guardrail, including the two
-- decided in TypeScript (geo, and the flag checks), writes the ledger the same
-- way rather than each route inventing a shape.
create or replace function public.commerce_guard_event(
  p_profile_id uuid,
  p_kind text,
  p_detail jsonb
) returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.commerce_guard_events (profile_id, kind, detail)
  values (p_profile_id, p_kind, coalesce(p_detail, '{}'::jsonb));
$$;

-- Get or create a member's limits row, locked for update.
--
-- The lock is on THIS row rather than on profiles, deliberately. Locking
-- profiles for the length of a checkout would contend with every points award,
-- every streak bump and every muster claim in the realm, which is a lot of
-- contention bought for nothing: what needs serialising is one member's
-- checkouts against each other, and this row is exactly that scope.
create or replace function public.commerce_limits_locked(p_profile_id uuid)
returns public.member_commerce_limits
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.member_commerce_limits;
begin
  insert into public.member_commerce_limits (profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into v_row
    from public.member_commerce_limits
   where profile_id = p_profile_id
     for update;

  -- A pending self cap raise that has come due is promoted here, lazily, at the
  -- moment somebody looks. No scheduled job: a raise that lands in a table
  -- nobody reads until the next checkout has landed exactly when it matters,
  -- and a cron for it would be a moving part with nothing to do.
  if v_row.pending_self_cap_at is not null and v_row.pending_self_cap_at <= now() then
    update public.member_commerce_limits
       set self_cap_minor = v_row.pending_self_cap_minor,
           pending_self_cap_minor = null,
           pending_self_cap_at = null,
           updated_at = now()
     where profile_id = p_profile_id
     returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- ============================================================
-- 6. The checkout guard
-- ============================================================
--
-- The whole decision, in one transaction, under one lock, returning either an
-- order id or the exact reason it refused. The route calls this INSTEAD of
-- inserting an order, which is the point: there is no path to an order that
-- does not pass through here.
--
-- THE ORDER OF THE CHECKS is not arbitrary.
--   0. Idempotency FIRST, before any check at all. A retry of an order that
--      already exists must return that order, never be re-judged, because the
--      first attempt already counts toward the member's spend and the retry
--      would now be refused by the very order it is retrying. That bug would
--      have looked exactly like a flaky payment provider.
--   1. Age, because a member who should not be buying at all should not be told
--      how close to a spending limit they are.
--   2. The member's own cap, before the realm's, so a member who set a limit is
--      told they met their own rather than the house's.
--   3. The realm's caps, day then month.
--   4. The velocity brake.
--   5. The acknowledgement, LAST among the refusals, because it is the only one
--      the member can clear immediately and it would be cruel to make them
--      clear it and then meet a wall behind it.
--
-- Every refusal writes the ledger and returns the member's real numbers, so a
-- surface can say "you have spent 260 in the last 30 days" rather than "not
-- allowed", which is the difference between an interruption and a dark pattern.

create or replace function public.commerce_checkout_guard(
  p_profile_id uuid,
  p_amount_minor integer,
  p_currency text,
  p_provider text,
  p_idempotency_key text,
  p_geo_country text,
  p_geo_source text,
  p_age_minimum integer,
  p_day_window_hours integer,
  p_day_cap_minor integer,
  p_month_window_hours integer,
  p_month_cap_minor integer,
  p_pending_grace_minutes integer,
  p_velocity_orders integer,
  p_velocity_window_minutes integer,
  p_ack_threshold_minor integer,
  p_ack_valid_hours integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limits public.member_commerce_limits;
  v_existing uuid;
  v_order_id uuid;
  v_day_minor integer;
  v_month_minor integer;
  v_velocity_count integer;
  v_velocity_clears_at timestamptz;
  v_state jsonb;
  v_effective_month_cap integer;
begin
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'commerce_checkout_guard: amount must be a non-negative integer';
  end if;

  -- 0. Idempotency, before judgement. See the header.
  select id into v_existing
    from public.orders
   where profile_id = p_profile_id
     and idempotency_key = p_idempotency_key
   limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'order_id', v_existing, 'reused', true);
  end if;

  v_limits := public.commerce_limits_locked(p_profile_id);

  -- Re-read idempotency under the lock. Two presses of the same button arrive
  -- concurrently more often than anybody expects, and without this the second
  -- one would be judged against a spend the first one had already added.
  select id into v_existing
    from public.orders
   where profile_id = p_profile_id
     and idempotency_key = p_idempotency_key
   limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'order_id', v_existing, 'reused', true);
  end if;

  v_day_minor := public.commerce_spend_minor(
    p_profile_id, p_day_window_hours, p_pending_grace_minutes
  );
  v_month_minor := public.commerce_spend_minor(
    p_profile_id, p_month_window_hours, p_pending_grace_minutes
  );

  -- The member's cap never widens the realm's. A self cap above the house cap
  -- is honoured as the house cap, silently and correctly, because the member
  -- asking for more than the realm allows is asking for something that was
  -- never theirs to grant.
  v_effective_month_cap := least(
    p_month_cap_minor, coalesce(v_limits.self_cap_minor, p_month_cap_minor)
  );

  v_state := jsonb_build_object(
    'day_minor', v_day_minor,
    'day_cap_minor', p_day_cap_minor,
    'month_minor', v_month_minor,
    'month_cap_minor', p_month_cap_minor,
    'self_cap_minor', v_limits.self_cap_minor,
    'amount_minor', p_amount_minor
  );

  -- 1. The age gate. Attested at or above the minimum in force, or verified by
  -- a provider that does not exist yet. Null is never "yes".
  if (
    v_limits.age_verified_at is null
    and (
      v_limits.age_attested_at is null
      or coalesce(v_limits.age_attested_minimum, 0) < p_age_minimum
    )
  ) then
    perform public.commerce_guard_event(
      p_profile_id, 'age_gate',
      jsonb_build_object('minimum', p_age_minimum)
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'age_gate',
      'minimum', p_age_minimum, 'state', v_state
    );
  end if;

  -- 2. The member's own cap.
  if v_limits.self_cap_minor is not null
     and v_month_minor + p_amount_minor > v_limits.self_cap_minor then
    perform public.commerce_guard_event(
      p_profile_id, 'self_cap',
      jsonb_build_object(
        'spent_minor', v_month_minor,
        'cap_minor', v_limits.self_cap_minor,
        'amount_minor', p_amount_minor
      )
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'self_cap',
      'cap_minor', v_limits.self_cap_minor, 'state', v_state
    );
  end if;

  -- 3. The realm's caps.
  if v_day_minor + p_amount_minor > p_day_cap_minor then
    perform public.commerce_guard_event(
      p_profile_id, 'spend_cap_day',
      jsonb_build_object(
        'spent_minor', v_day_minor,
        'cap_minor', p_day_cap_minor,
        'amount_minor', p_amount_minor
      )
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'spend_cap_day',
      'cap_minor', p_day_cap_minor, 'state', v_state
    );
  end if;

  if v_month_minor + p_amount_minor > v_effective_month_cap then
    perform public.commerce_guard_event(
      p_profile_id, 'spend_cap_month',
      jsonb_build_object(
        'spent_minor', v_month_minor,
        'cap_minor', v_effective_month_cap,
        'amount_minor', p_amount_minor
      )
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'spend_cap_month',
      'cap_minor', v_effective_month_cap, 'state', v_state
    );
  end if;

  -- 4. The velocity brake. Paid orders only: the signal is money actually
  -- leaving, not sessions opened. It clears itself when the oldest of them
  -- falls out of the window, and the answer says exactly when.
  select count(*), min(coalesce(paid_at, created_at))
    into v_velocity_count, v_velocity_clears_at
    from public.orders
   where profile_id = p_profile_id
     and status = any (array['paid'::text, 'fulfilled'::text])
     and coalesce(paid_at, created_at)
         >= now() - make_interval(mins => p_velocity_window_minutes);

  if v_velocity_count >= p_velocity_orders and v_velocity_clears_at is not null then
    v_velocity_clears_at := v_velocity_clears_at
      + make_interval(mins => p_velocity_window_minutes);
    perform public.commerce_guard_event(
      p_profile_id, 'velocity',
      jsonb_build_object(
        'orders', v_velocity_count,
        'window_minutes', p_velocity_window_minutes
      )
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'velocity',
      'orders', v_velocity_count,
      'clears_at', v_velocity_clears_at,
      'state', v_state
    );
  end if;

  -- 5. The informed consent interruption. Past the threshold, a member sees
  -- their real running total and says so, once a day, for as long as they keep
  -- spending. The number they are shown is the one computed here.
  if v_month_minor + p_amount_minor > p_ack_threshold_minor
     and (
       v_limits.acknowledged_at is null
       or v_limits.acknowledged_at < now() - make_interval(hours => p_ack_valid_hours)
     ) then
    perform public.commerce_guard_event(
      p_profile_id, 'acknowledgement',
      jsonb_build_object(
        'spent_minor', v_month_minor,
        'threshold_minor', p_ack_threshold_minor
      )
    );
    return jsonb_build_object(
      'ok', false, 'reason', 'acknowledgement',
      'threshold_minor', p_ack_threshold_minor,
      'state', v_state
    );
  end if;

  -- Everything cleared. The order is created HERE, inside the same transaction
  -- and under the same lock that judged it, which is the only arrangement in
  -- which the totals above are still true by the time the row exists.
  insert into public.orders (
    profile_id, status, total_minor, currency, idempotency_key, provider,
    geo_country, geo_source
  )
  values (
    p_profile_id, 'pending', p_amount_minor, p_currency, p_idempotency_key,
    p_provider, p_geo_country, p_geo_source
  )
  returning id into v_order_id;

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id, 'reused', false, 'state', v_state
  );
end;
$$;
