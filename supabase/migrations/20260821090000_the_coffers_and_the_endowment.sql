-- The Coffers and the Endowment: one reconciled earnings record, and the way a
-- member takes part in a House economy.
--
-- WHY
-- Two economies half existed. On the creator side a member's earnings settled
-- in five different places and added up nowhere: the surface that tried to show
-- them derived a total nothing checked, and it was wrong in four ways at once
-- (see the header of lib/economy/earnings.ts). On the House side a treasury
-- received, spent and decided, and a member could do none of the three. This
-- migration closes both, and adds nothing that mints.
--
-- WHAT IS HERE
--   1. A new points_ledger category, 'house', so a gift to a banner is not
--      counted as an earning or as a stake.
--   2. house_endowments, the record of every POINT a member gave their House.
--   3. public.endow_house_treasury, the one transaction that moves it.
--   4. Two reconciliation reads, one per ledger, so a cached balance can be
--      checked against the rows that are supposed to explain it.
--   5. Two sealed flags.
--
-- THE INVARIANT THE WHOLE FILE SERVES: NO HOUSE MINTS VALUE OUT OF NOTHING.
-- Every POINT a treasury gains here left a member's balance, and MORE left it
-- than arrived. Nothing is credited with the difference: it is destroyed, which
-- is what makes this a sink and not a transfer. The arithmetic and the argument
-- for the ratio are in lib/houses/endowment.ts.
--
-- SECURITY POSTURE
-- Every function here is SECURITY DEFINER. Two of them only read, and they are
-- revoked just as hard as the one that writes, because Supabase publishes every
-- public function at /rest/v1/rpc/<name> and the anon key ships in the browser
-- bundle: a reader that bypasses RLS on points_ledger is a reader of every
-- member's whole financial history. service_role only, and nothing else, ever.
-- See 20260811090000_revoke_public_execute_on_economy_rpcs.sql.
--
-- REPOSITORY VERSUS DATABASE, checked before a line of this was written, as
-- supabase/migrations/README.md requires. The live definition of
-- points_ledger_category_check was read out of the project first and is
-- ('social', 'call', 'war', 'stake'), matching
-- 20260815120000_call_stakes_and_house_treasury.sql exactly. The change below
-- adds 'house' and removes nothing, so no existing row and no existing writer
-- can be broken by it. That check is not optional here: this is the fourth
-- migration in a row to touch this one constraint, and the third one nearly
-- took every War award in the realm offline by re-adding it from a stale
-- reading of this directory.

-- ============================================================
-- 1. The ledger category
-- ============================================================
--
-- 'house' is a balance MOVING to a banner, the way 'stake' is a balance moving
-- into escrow. Neither is an award and neither may be counted as one. It gets
-- its own value rather than reusing 'stake' so the statement in The Coffers can
-- separate "what staking did to you" from "what you gave away", which are
-- different sentences about a member, and so a future cap on either existing
-- category cannot accidentally sum an endowment.

alter table public.points_ledger
  drop constraint if exists points_ledger_category_check;
alter table public.points_ledger
  add constraint points_ledger_category_check check (
    category is null
    or category = any (
      array['social'::text, 'call'::text, 'war'::text, 'stake'::text, 'house'::text]
    )
  );

-- ============================================================
-- 2. house_endowments
-- ============================================================
--
-- One row per gift. The split is stored on the row rather than recomputed from
-- the committed amount, for the same reason call_stakes stores what settlement
-- actually did: a later release that changed the ratio would silently rewrite
-- every historical gift, and a member's own record of what they gave must not
-- move because somebody retuned a constant.
--
-- house_slug is frozen here and never read back from the profile. A member who
-- swears to a new House does not take their old House's endowments with them,
-- which is the same rule the oath window already enforces for contributions
-- (20260811140100). Nothing about a House's history ever moves.
--
-- REQUEST_ID IS THE IDEMPOTENCY KEY AND IT IS NOT DECORATION. Unlike an escrow,
-- which is keyed on the post being staked, an endowment has no natural key: the
-- same member may give the same House the same amount twice in a minute and
-- both are real. So the caller supplies the key and a retry carries the same
-- one. A replay finds the unique index, moves nothing, and returns the original
-- outcome. Without it, a client that retries on a timeout debits a member twice
-- for one gift, and there is no way to tell that apart from a member who meant
-- to give twice.

create table if not exists public.house_endowments (
  id uuid not null default gen_random_uuid(),
  -- Supplied by the caller, unique across the realm. See above.
  request_id uuid not null,
  house_slug text not null,
  profile_id uuid not null,
  -- What left the member's balance.
  committed integer not null,
  -- What reached the treasury.
  to_treasury integer not null,
  -- What was destroyed. committed = to_treasury + destroyed, enforced below.
  destroyed integer not null,
  created_at timestamptz not null default now(),
  constraint house_endowments_pkey primary key (id),
  constraint house_endowments_request_id_key unique (request_id),
  constraint house_endowments_house_slug_fkey
    foreign key (house_slug) references public.houses (slug) on delete cascade,
  constraint house_endowments_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  -- The bounds live in lib/houses/endowment.ts and are justified there. They
  -- are repeated here because the database is the last line and a bound that
  -- exists only in TypeScript is a bound a future route can forget.
  constraint house_endowments_committed_check
    check (committed >= 50 and committed <= 1000),
  constraint house_endowments_parts_check
    check (to_treasury >= 0 and destroyed >= 0),
  -- The one that actually matters. A gift whose parts do not add back to the
  -- whole has either minted a POINT or lost one, and this is the last place
  -- either could be caught.
  constraint house_endowments_split_check
    check (to_treasury + destroyed = committed),
  -- Endowing must never be a cheaper door into a treasury than losing a stake.
  -- The stake tithe is half; if this ever pooled more than it destroyed, every
  -- POINT in the realm would find this door instead.
  constraint house_endowments_burn_check check (destroyed >= to_treasury)
);

-- The daily cap read, which is the hot path: everything one member gave today.
create index if not exists house_endowments_profile_idx
  on public.house_endowments (profile_id, created_at desc);

-- The House's roll of benefactors, newest first.
create index if not exists house_endowments_house_idx
  on public.house_endowments (house_slug, created_at desc);

-- Public read, deliberately, exactly as house_treasury_ledger is. This is half
-- of a House's audit trail and an audit trail one person can see is not one. It
-- carries no private data: a House slug, an amount given to it, and a member id
-- that is public anyway. The member's BALANCE is not here and is not derivable
-- from here.
alter table public.house_endowments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'house_endowments'
       and policyname = 'public read'
  ) then
    create policy "public read" on public.house_endowments
      for select to public using (true);
  end if;
end $$;

-- ============================================================
-- 3. endow_house_treasury
-- ============================================================
--
-- One transaction, two locks, taken in the same order settle_call_stake takes
-- them: the profile first, then the House. Deadlock is not hypothetical here.
-- A member's stake settling and the same member endowing touch exactly the same
-- two rows, and two functions that disagreed about the order would eventually
-- meet in the middle and one of them would be killed.
--
-- WHY THE CHECKS ARE NOT IN THE ROUTE. Every one of them (the balance, the
-- day's cap, the oath) is a read whose answer can change before the write. A
-- balance read in one round trip and spent in the next is not a balance, and a
-- daily cap checked in TypeScript is a cap two concurrent requests both pass.
-- The profile row lock is what makes the read and the write one moment.
--
-- WHY THE DAY IS THE DATABASE'S. p_now is deliberately absent. A job host or a
-- browser whose clock is a day fast would otherwise get a second day's
-- allowance for free, and the cap is the only thing bounding how fast a balance
-- becomes a House's capability.

create or replace function public.endow_house_treasury(
  p_request_id uuid,
  p_house_slug text,
  p_profile_id uuid,
  p_amount integer,
  p_min integer,
  p_daily_cap integer,
  p_treasury_bps integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_given_today bigint;
  v_sworn integer;
  v_to_treasury integer;
  v_destroyed integer;
  v_id uuid;
  v_inserted integer;
  v_treasury bigint;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_positive');
  end if;
  if p_min is null or p_daily_cap is null or p_treasury_bps is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_terms');
  end if;
  if p_treasury_bps < 0 or p_treasury_bps > 5000 then
    -- Above 5000 the treasury would gain more than the burn destroys, which is
    -- the one ratio this design cannot allow. Bounded here as well as in
    -- TypeScript because a caller passing its own terms is a caller that can
    -- get them wrong.
    return jsonb_build_object('ok', false, 'reason', 'bad_terms');
  end if;
  if p_amount < p_min then
    return jsonb_build_object('ok', false, 'reason', 'below_minimum');
  end if;
  if p_amount > p_daily_cap then
    return jsonb_build_object('ok', false, 'reason', 'over_daily_cap');
  end if;

  -- Serialises every balance movement for this member, so the reads below and
  -- the debit further down cannot interleave with a concurrent endowment, a
  -- stake being escrowed, or a stake settling.
  perform 1 from public.profiles where id = p_profile_id for update;

  select points into v_balance from public.profiles where id = p_profile_id;
  if v_balance is null then
    return jsonb_build_object('ok', false, 'reason', 'no_member');
  end if;

  -- An OPEN oath to THIS House. Read from house_members rather than from
  -- profiles.house_slug, because that is the table the treasury's spend rule
  -- reads and the two must not be able to disagree about who is sworn.
  select count(*) into v_sworn
    from public.house_members
   where profile_id = p_profile_id
     and house_slug = p_house_slug
     and left_at is null;
  if v_sworn = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_sworn');
  end if;

  -- The day, on the database's clock, across every House. A member has one
  -- daily allowance, not one per banner they have ever sworn to.
  select coalesce(sum(committed), 0) into v_given_today
    from public.house_endowments
   where profile_id = p_profile_id
     and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';

  if v_given_today + p_amount > p_daily_cap then
    return jsonb_build_object(
      'ok', false, 'reason', 'over_daily_cap', 'given_today', v_given_today
    );
  end if;

  if v_balance < p_amount then
    return jsonb_build_object(
      'ok', false, 'reason', 'insufficient', 'balance', v_balance
    );
  end if;

  -- floor on the pooled half and a subtraction for the remainder, never two
  -- roundings. Identical to splitEndowment in TypeScript, and to the tithe in
  -- settle_call_stake, so the figure the dialog promised and the figure written
  -- here are the same figure.
  v_to_treasury := floor(p_amount::numeric * p_treasury_bps / 10000);
  v_destroyed := p_amount - v_to_treasury;

  -- Claim the request id BEFORE anything moves, exactly as escrow_call_stake
  -- claims the post id. A replay conflicts here and leaves every balance
  -- untouched.
  insert into public.house_endowments
    (request_id, house_slug, profile_id, committed, to_treasury, destroyed)
  values
    (p_request_id, p_house_slug, p_profile_id, p_amount, v_to_treasury, v_destroyed)
  on conflict (request_id) do nothing
  returning id into v_id;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- A retry of a gift that already landed. Nothing to do and nothing to undo.
    -- Reported as success because the member's intent was carried out, once.
    return jsonb_build_object('ok', true, 'reason', 'already', 'committed', 0);
  end if;

  update public.profiles
     set points = points - p_amount
   where id = p_profile_id;

  -- points only. Renown must never fall and Glory decides who may spend a
  -- treasury (deriveLeadership in lib/houses/scoring.ts ranks on Glory), so an
  -- endowment writes a glory_delta of exactly zero. A member who could raise
  -- their Glory by giving could buy the right to spend the treasury they had
  -- just filled, and that is the failure that would end the design.
  insert into public.points_ledger
    (profile_id, points_delta, glory_delta, reason, ref, category)
  values
    (p_profile_id, -p_amount, 0, 'house_endowed', v_id, 'house');

  perform 1 from public.houses where slug = p_house_slug for update;
  update public.houses
     set treasury = treasury + v_to_treasury
   where slug = p_house_slug
  returning treasury into v_treasury;

  -- The inflow carries the giver's id. Every other inflow carries null,
  -- because nobody decided it; this one is the whole point of the feature.
  insert into public.house_treasury_ledger
    (house_slug, delta, reason, ref, actor_id)
  values
    (p_house_slug, v_to_treasury, 'house_endowed', v_id, p_profile_id);

  return jsonb_build_object(
    'ok', true,
    'reason', 'given',
    'endowment_id', v_id,
    'committed', p_amount,
    'to_treasury', v_to_treasury,
    'destroyed', v_destroyed,
    'balance', v_balance - p_amount,
    'treasury', v_treasury,
    'given_today', v_given_today + p_amount
  );
end;
$$;

-- ============================================================
-- 4. The two reconciliations
-- ============================================================
--
-- Both ledgers in this product keep a cached total beside the rows that are
-- supposed to explain it: profiles.points beside points_ledger, and
-- houses.treasury beside house_treasury_ledger. That is the right shape and it
-- is also the shape that drifts silently, because nothing has ever compared
-- the two.
--
-- These sum in the database rather than in the route on purpose. The surface
-- they replace read two thousand ledger rows into Node and added them up, which
-- is wrong twice over: it is a full page of a member's financial history over
-- the wire to produce one integer, and it silently stops being the whole sum at
-- row two thousand and one, at which point the "drift" it reports is its own
-- truncation. A member's balance being wrong is a serious claim and it must not
-- be made by an incomplete read.
--
-- Marked stable and revoked from every browser role. A reader that bypasses RLS
-- on points_ledger is a reader of every member's whole history.

create or replace function public.reconcile_member_points(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cached', coalesce((select points from public.profiles where id = p_profile_id), 0),
    'ledger', coalesce((
      select sum(points_delta) from public.points_ledger where profile_id = p_profile_id
    ), 0),
    'glory_cached', coalesce((select glory from public.profiles where id = p_profile_id), 0),
    'glory_ledger', coalesce((
      select sum(glory_delta) from public.points_ledger where profile_id = p_profile_id
    ), 0),
    'entries', coalesce((
      select count(*) from public.points_ledger where profile_id = p_profile_id
    ), 0)
  );
$$;

create or replace function public.reconcile_house_treasury(p_house_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'cached', coalesce((select treasury from public.houses where slug = p_house_slug), 0),
    'ledger', coalesce((
      select sum(delta) from public.house_treasury_ledger where house_slug = p_house_slug
    ), 0),
    'entries', coalesce((
      select count(*) from public.house_treasury_ledger where house_slug = p_house_slug
    ), 0)
  );
$$;

-- ============================================================
-- 5. The flags
-- ============================================================
--
-- Both ship off. coffers_live seals the statement surface; endowment_live seals
-- the gift. They are separate switches because reading your own earnings and
-- committing your balance to a House are different decisions, and a member
-- should be able to have the first without the second.

insert into public.realm_flags (key, enabled)
values ('coffers_live', false), ('endowment_live', false)
on conflict (key) do nothing;

-- ============================================================
-- 6. EXECUTE grants
-- ============================================================

revoke all on function public.endow_house_treasury(uuid, text, uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.reconcile_member_points(uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_house_treasury(text)
  from public, anon, authenticated;

grant execute on function public.endow_house_treasury(uuid, text, uuid, integer, integer, integer, integer)
  to service_role;
grant execute on function public.reconcile_member_points(uuid)
  to service_role;
grant execute on function public.reconcile_house_treasury(text)
  to service_role;
