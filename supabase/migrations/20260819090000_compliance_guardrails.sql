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

-- ============================================================
-- 1. Where a member's compliance state lives, and why not on profiles
-- ============================================================
--
-- A separate table rather than four more columns on profiles, and the reason is
-- not tidiness. public.profiles carries COLUMN LEVEL GRANTS to anon: the
-- browser role holds SELECT on handle, display_name, bio, glory, house_slug and
-- a dozen more, because the profile is a public object and the realm renders it
-- to signed out visitors. Adding an age attestation to that table would put a
-- compliance fact one accidental grant away from a public read, and the grants
-- on that table are wide enough that the accident is plausible.
--
-- So it sits in its own table, deny by default, no grants to any browser role,
-- reachable only through the service role in a route. The Muster put three
-- columns on profiles for a good reason and this puts none there for a better
-- one: attendance is public and an age attestation is not.
--
-- MINIMAL BY DESIGN. There is no date of birth column and there must never be
-- one. The gate asks "at least eighteen" and stores that it was answered, when,
-- and against which minimum. A birth date is identifying data the realm would
-- then owe a duty of care over, and it answers a question nobody asked.

create table if not exists public.member_commerce_limits (
  profile_id uuid not null,

  -- THE AGE GATE. A self declaration, and named as one everywhere it appears.
  -- age_attested_minimum records the threshold in force at the time so that
  -- raising the minimum later re-asks everybody rather than grandfathering
  -- them silently, which a bare boolean could not express.
  age_attested_at timestamptz,
  age_attested_minimum integer,

  -- THE SEAM FOR REAL VERIFICATION. Nothing writes these today. A document or
  -- credit check provider is a paid service (rule 19) and the realm does not
  -- have one, so the columns exist to be filled by one later rather than to
  -- suggest one exists now. A route reading them must treat null as "never
  -- verified", never as "verified by default".
  age_verified_at timestamptz,
  age_verification_method text,

  -- THE MEMBER SET CAP, applied to the 30 day window alongside the realm's own.
  -- Null means the member has set none and only the realm's cap applies.
  self_cap_minor integer,
  -- A RAISE IN WAITING. Lowering a self cap takes effect at once; raising one
  -- waits, and until pending_self_cap_at passes, the lower cap in
  -- self_cap_minor is still the one enforced. That asymmetry is the difference
  -- between a self limit and a slider: a limit a member can raise in the moment
  -- they want to raise it is not a limit.
  pending_self_cap_minor integer,
  pending_self_cap_at timestamptz,

  -- THE INFORMED CONSENT INTERRUPTION. acknowledged_spend_minor is the real 30
  -- day total the SERVER computed and showed the member, never a number the
  -- client sent, so the row is evidence of what they were actually shown.
  acknowledged_at timestamptz,
  acknowledged_spend_minor integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_commerce_limits_pkey primary key (profile_id),
  constraint member_commerce_limits_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint member_commerce_limits_age_minimum_check
    check (age_attested_minimum is null or age_attested_minimum between 13 and 25),
  constraint member_commerce_limits_self_cap_check
    check (self_cap_minor is null or self_cap_minor >= 0),
  constraint member_commerce_limits_pending_cap_check
    check (pending_self_cap_minor is null or pending_self_cap_minor >= 0),
  -- A pending raise without a time to land, or a time with nothing to land, is
  -- a half written intention that a later reader would have to guess about.
  constraint member_commerce_limits_pending_pair_check
    check ((pending_self_cap_minor is null) = (pending_self_cap_at is null)),
  constraint member_commerce_limits_ack_check
    check (acknowledged_spend_minor is null or acknowledged_spend_minor >= 0),
  constraint member_commerce_limits_verification_method_check
    check (
      age_verification_method is null
      or (age_verification_method <> ''::text and char_length(age_verification_method) <= 40)
    )
);

-- ============================================================
-- 2. The refusal ledger
-- ============================================================
--
-- Every time a guardrail turns a member away, a row lands here. This is the
-- half of a compliance posture that is easy to leave out and impossible to
-- reconstruct afterwards: a guardrail that refuses and keeps no record cannot
-- answer the only question anybody will ever ask it, which is "show me that it
-- fires".
--
-- It records the refusal, not the member's data: a kind, and a detail object
-- carrying the numbers the decision turned on. No cart, no card, no address.

create table if not exists public.commerce_guard_events (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  -- One of the names in GUARD_REASONS (lib/commerce/compliance.ts), or an alms
  -- refusal. Deliberately a text check rather than an enum: an enum would need
  -- a migration to add a reason, and a reason that cannot be added is a reason
  -- that gets logged under the wrong name.
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commerce_guard_events_pkey primary key (id),
  constraint commerce_guard_events_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint commerce_guard_events_kind_check
    check (kind <> ''::text and char_length(kind) <= 40)
);

create index if not exists commerce_guard_events_profile_idx
  on public.commerce_guard_events (profile_id, created_at desc);

-- A refusal is only useful in aggregate if it can be counted by kind over a
-- period. This is the index that makes "how often did the velocity brake fire
-- last week" a question anyone can answer.
create index if not exists commerce_guard_events_kind_idx
  on public.commerce_guard_events (kind, created_at desc);

-- ============================================================
-- 3. Geo, recorded on the order
-- ============================================================
--
-- Two columns rather than one, because the country alone is worthless without
-- knowing how it was arrived at. 'platform-header' is an edge network's guess
-- from an address, defeated by any VPN. A later 'payment-provider' value would
-- be the card's issuing country, which is materially stronger because a card is
-- issued against a real address. Storing them in the same column with no source
-- would flatten two very different confidences into one, and whoever read it
-- later would have no way to tell them apart.
--
-- Null country is a first class value meaning "could not be established", and
-- is never to be read as an allowed default.

alter table public.orders
  add column if not exists geo_country text,
  add column if not exists geo_source text;

alter table public.orders
  drop constraint if exists orders_geo_country_check;
alter table public.orders
  add constraint orders_geo_country_check
  check (geo_country is null or geo_country ~ '^[A-Z]{2}$');

alter table public.orders
  drop constraint if exists orders_geo_source_check;
alter table public.orders
  add constraint orders_geo_source_check
  check (
    geo_source is null
    or geo_source = any (array['platform-header'::text, 'payment-provider'::text, 'none'::text])
  );

-- ============================================================
-- 4. The Alms: a third way a chest entitlement can exist
-- ============================================================
--
-- The free path grants a REAL entitlement, not a token and not a coupon. It is
-- a row in the same ledger a purchase writes, differing only in source_kind,
-- and it opens through the same route against the same committed seed on the
-- same printed odds with the same guaranteed floor and the same provable
-- reveal. There is no code path anywhere that reads source_kind and rolls
-- differently, and there must never be one: that is the property that makes
-- this a free method of entry rather than a consolation prize.
--
-- The live constraint was read out of the database first, per the README, and
-- was ('order', 'redemption'), matching 20260812224950_commerce_engine.sql.
-- This adds a value and removes none.

alter table public.chest_entitlements
  drop constraint if exists chest_entitlements_source_kind_check;
alter table public.chest_entitlements
  add constraint chest_entitlements_source_kind_check
  check (source_kind = any (array['order'::text, 'redemption'::text, 'amoe'::text]));

-- The two reads the Alms makes, both partial so they stay small however many
-- purchased entitlements exist. The first answers "when did this member last
-- claim", the second answers "how many has the realm given today".
create index if not exists chest_entitlements_amoe_member_idx
  on public.chest_entitlements (profile_id, created_at desc)
  where source_kind = 'amoe'::text;

create index if not exists chest_entitlements_amoe_day_idx
  on public.chest_entitlements (created_at desc)
  where source_kind = 'amoe'::text;

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

-- ============================================================
-- 9. Seal everything
-- ============================================================
--
-- Deny by default on both tables, and every function revoked from the browser
-- roles. Supabase publishes every public function at /rest/v1/rpc/<name> and
-- the anon key ships in the browser bundle, so a function that grants a free
-- chest and is callable by anon is a faucet with a public tap. See
-- 20260811090000_revoke_public_execute_on_economy_rpcs.sql for the incident
-- this rule comes from.

alter table public.member_commerce_limits enable row level security;
alter table public.commerce_guard_events enable row level security;

revoke all on public.member_commerce_limits from anon, authenticated;
revoke all on public.commerce_guard_events from anon, authenticated;

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
