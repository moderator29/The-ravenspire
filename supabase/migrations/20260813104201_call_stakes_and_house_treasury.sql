-- Sinks and stakes: staked Calls, and a House treasury that spends the burns.
--
-- WHY
-- The realm mints Renown, Glory and POINTS and has almost nowhere to spend any
-- of them. An economy that only ever adds is an economy where nothing is at
-- risk and nothing is scarce, and after a year of it every number on a profile
-- means the same thing: time served. V2 sections 36.3 and 37.4 call this out
-- as the open half of the loop. This migration closes it in two pieces that
-- feed each other.
--
-- PIECE ONE: A CALL CAN CARRY A STAKE.
-- A member may put POINTS behind a Call. The stake is escrowed at seal time,
-- inside one function that holds the member's profile row lock, so a member
-- cannot stake points they do not have and two concurrent seals cannot both
-- spend the same balance. When the Call resolves, the stake returns with a
-- bonus scaled to the difficulty the scoring engine already computed, or it
-- burns. Settlement is idempotent: the escrow row is the lock and the record,
-- and a replayed settle changes nothing.
--
-- PIECE TWO: A BURN IS A SINK, AND HALF OF IT POOLS UNDER A BANNER.
-- Half of every burned stake is destroyed outright and can never be earned
-- again by anyone. The other half is credited to the House the staker was
-- sworn to when they sealed the Call. That is the whole funding model for a
-- House treasury: real sinks, never a mint, never a seed, never a top up. A
-- House with no burned stakes under its banner has a treasury of zero and the
-- hall renders zero.
--
-- WHY HALF AND NOT ALL OR NOTHING. At all of it the burn is not a burn, it is
-- a transfer: the realm's point supply never falls and the House hands the
-- points straight back through a perk. At none of it the burn is a clean
-- contraction and Houses have nothing to spend, which leaves the second half
-- of this work unfunded. Half destroys and half pools, so the supply genuinely
-- contracts and a House still has something only it can decide about.
--
-- WHAT A STAKE NEVER TOUCHES
-- profiles.points, and nothing else. Not renown, not glory, not season_rating,
-- not tier. Renown must never fall (section 9.3, and apply_call_score takes
-- greatest(p_score, 0) for exactly this reason), so an escrow that reduced it
-- would break the one promise the ladder makes. On the way back, a returned
-- stake that ADDED renown would be a laundry: stake, win, repeat, and mint
-- permanent standing out of a balance that was never spent. Points in, points
-- out, and the two-currency settlement carries on untouched beside it.
--
-- SECURITY POSTURE
-- Every function here is SECURITY DEFINER and every one of them moves a
-- balance, so every one of them is exactly the shape of the exploit closed in
-- 20260811090000: Supabase publishes every public function at
-- /rest/v1/rpc/<name> and the anon key ships in the browser bundle.
-- service_role only, and nothing else, ever.

-- ============================================================
-- 1. The ledger category
-- ============================================================
--
-- 20260812001000 constrained points_ledger.category to 'social' or 'call'.
-- A stake movement is neither: it is not an award at all, it is a balance
-- moving out and sometimes back. It gets its own value so that a future cap on
-- either existing category cannot accidentally sum a negative stake row and
-- hand out allowance for it, and so the ledger can be read honestly as
-- "what did staking do to this member" without pattern matching on `reason`.

-- WAR IS ON THIS LIST AND WAS NOT, WHICH WOULD HAVE BROKEN THE WAR ECONOMY.
-- This migration was written against a branch that did not carry
-- 20260813084440_commerce_hardening.sql, where 'war' was added, so the natural
-- reading of the repository at the time said the categories were 'social' and
-- 'call'. Re-adding the constraint from that reading would have dropped 'war',
-- and public.award_capped writes exactly that category on every settled
-- battle: every War award in the realm would have started failing its check
-- constraint the moment this ran. Caught by comparing the constraint against
-- the live database rather than against the repository, which is now a step in
-- the handoff for anybody touching a check constraint.
alter table public.points_ledger
  drop constraint if exists points_ledger_category_check;
alter table public.points_ledger
  add constraint points_ledger_category_check check (
    category is null
    or category = any (array['social'::text, 'call'::text, 'war'::text, 'stake'::text])
  );

-- ============================================================
-- 2. call_stakes: the escrow record, and the idempotency key
-- ============================================================
--
-- One row per staked Call, keyed on the post. The primary key is the whole
-- idempotency story: an escrow that runs twice conflicts and does nothing the
-- second time, and a settle that runs twice finds a row that is no longer
-- 'escrowed' and does nothing the second time. There is no counter to get
-- wrong and no window between a check and a write.
--
-- house_slug is frozen at seal time rather than read from the profile at
-- settlement. A member who swears to a new House in the off season should not
-- have a burn from their old banner's era credited to the new one, and this is
-- the same rule the season contribution join already enforces by oath window
-- (see 20260811140100). Nothing about a House's history ever moves.

create table if not exists public.call_stakes (
  post_id uuid not null,
  profile_id uuid not null,
  -- Null for a member sworn to no House. The tithe then has nowhere to go and
  -- the whole burn is destroyed, rather than being pooled somewhere invented.
  house_slug text,
  stake integer not null,
  -- escrowed  points are held, the Call is running
  -- returned  the Call landed or was voided, points went back
  -- burned    the Call missed, points are gone
  status text not null default 'escrowed',
  -- What settlement actually did, kept on the row so the member's history is
  -- readable without recomputing a payout from a score that may have been
  -- clamped differently in a later release.
  bonus integer not null default 0,
  returned integer not null default 0,
  burned integer not null default 0,
  tithe integer not null default 0,
  -- What the Warden's Pardon put back, if the House had one burning.
  pardon integer not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint call_stakes_pkey primary key (post_id),
  constraint call_stakes_post_id_fkey
    foreign key (post_id) references public.posts (id) on delete cascade,
  constraint call_stakes_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint call_stakes_house_slug_fkey
    foreign key (house_slug) references public.houses (slug) on delete set null,
  -- The bounds live in lib/calls/stake.ts and are justified there. They are
  -- repeated here because the database is the last line and a bound that only
  -- exists in TypeScript is a bound that a future route can forget.
  constraint call_stakes_amount_check check (stake >= 25 and stake <= 1000),
  constraint call_stakes_status_check
    check (status in ('escrowed', 'returned', 'burned'))
);

-- The member's own staking history, newest first.
create index if not exists call_stakes_profile_idx
  on public.call_stakes (profile_id, created_at desc);

-- RLS on, no policy: service role only, like points_ledger. A stake is money
-- moving and the surfaces that show it are served by routes holding the
-- service-role key.
alter table public.call_stakes enable row level security;

-- ============================================================
-- 3. The House treasury
-- ============================================================
--
-- houses.treasury is a cached balance and house_treasury_ledger is the source
-- of truth, which is the same shape points_ledger and profiles.points already
-- have. Every movement writes a ledger row carrying who did it, what for, and
-- when, so a treasury can always be reconstructed and a spend can always be
-- attributed. A treasury spent in the dark is a treasury members stop filling.

alter table public.houses
  add column if not exists treasury bigint not null default 0;

alter table public.houses
  drop constraint if exists houses_treasury_check;
alter table public.houses
  add constraint houses_treasury_check check (treasury >= 0);

create table if not exists public.house_treasury_ledger (
  id uuid not null default gen_random_uuid(),
  house_slug text not null,
  -- Positive is an inflow (a burned stake's tithe), negative is an outflow (a
  -- perk bought, a pardon paid). The sum over a House is its balance.
  delta bigint not null,
  reason text not null,
  -- The post whose stake burned, or the perk row that was bought.
  ref uuid,
  -- Who caused it. Null for an inflow, which nobody decided.
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint house_treasury_ledger_pkey primary key (id),
  constraint house_treasury_ledger_house_slug_fkey
    foreign key (house_slug) references public.houses (slug) on delete cascade,
  constraint house_treasury_ledger_actor_id_fkey
    foreign key (actor_id) references public.profiles (id) on delete set null,
  constraint house_treasury_ledger_delta_check check (delta <> 0)
);

create index if not exists house_treasury_ledger_house_idx
  on public.house_treasury_ledger (house_slug, created_at desc);

-- Public read, deliberately. This is the audit trail, and an audit trail only
-- one person can see is not an audit trail. It carries no private data: a
-- House slug, an amount, a reason and a member id that is public anyway.
alter table public.house_treasury_ledger enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'house_treasury_ledger'
       and policyname = 'public read'
  ) then
    create policy "public read" on public.house_treasury_ledger
      for select to public using (true);
  end if;
end $$;

-- ============================================================
-- 4. house_perks: what a treasury was spent on, and what is burning now
-- ============================================================
--
-- A perk is a row with a window, not a flag. Nothing has to sweep an expired
-- perk, because a perk is active exactly when now() is inside its window and
-- its allowance, if it has one, is not empty. The catalogue and the prices
-- live in lib/houses/perks.ts, which is where they can be explained.

create table if not exists public.house_perks (
  id uuid not null default gen_random_uuid(),
  house_slug text not null,
  perk text not null,
  cost bigint not null,
  -- Ring-fenced spend for the perks that pay out (the Warden's Pardon). Null
  -- for the perks that are simply switched on for their window.
  allowance_remaining bigint,
  -- The Lord or the Hand who bought it. Never null: a perk nobody is
  -- accountable for is the thing this table exists to prevent.
  actor_id uuid not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint house_perks_pkey primary key (id),
  constraint house_perks_house_slug_fkey
    foreign key (house_slug) references public.houses (slug) on delete cascade,
  constraint house_perks_actor_id_fkey
    foreign key (actor_id) references public.profiles (id) on delete restrict,
  constraint house_perks_window_check check (expires_at > starts_at),
  constraint house_perks_cost_check check (cost > 0),
  constraint house_perks_allowance_check
    check (allowance_remaining is null or allowance_remaining >= 0)
);

-- The two reads this table serves: what is burning over one House right now,
-- and the hall's purchase history.
create index if not exists house_perks_active_idx
  on public.house_perks (house_slug, expires_at desc);

alter table public.house_perks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'house_perks'
       and policyname = 'public read'
  ) then
    create policy "public read" on public.house_perks
      for select to public using (true);
  end if;
end $$;

-- ============================================================
-- 5. escrow_call_stake
-- ============================================================
--
-- Takes the stake out of the member's balance and records the escrow, or
-- refuses. One function, because the check and the debit cannot be two
-- statements: reading the balance in TypeScript and deducting afterwards
-- leaves a window in which two concurrent seals both see the same points and
-- both spend them, which is precisely the bug the row lock in award_capped
-- exists to close (20260813140000). The profile row lock serialises every
-- balance movement for a member, so the read below and the update further down
-- cannot interleave with another request doing the same.
--
-- Idempotent on post_id. A retried request finds the row already there and
-- returns 'already' having moved nothing, rather than debiting twice.

create or replace function public.escrow_call_stake(
  p_post_id uuid,
  p_profile_id uuid,
  p_stake integer,
  p_house_slug text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_inserted integer;
begin
  if p_stake is null or p_stake <= 0 then
    return jsonb_build_object('ok', true, 'escrowed', 0, 'reason', 'none');
  end if;

  -- The bounds are enforced here as well as in the table constraint and in
  -- TypeScript, so that a caller passing something out of range gets a clean
  -- refusal rather than a constraint violation it has to parse.
  if p_stake < 25 or p_stake > 1000 then
    return jsonb_build_object('ok', false, 'escrowed', 0, 'reason', 'bounds');
  end if;

  perform 1 from public.profiles where id = p_profile_id for update;

  select points into v_balance from public.profiles where id = p_profile_id;
  if v_balance is null then
    return jsonb_build_object('ok', false, 'escrowed', 0, 'reason', 'no_member');
  end if;
  if v_balance < p_stake then
    return jsonb_build_object(
      'ok', false, 'escrowed', 0, 'reason', 'insufficient', 'balance', v_balance
    );
  end if;

  insert into public.call_stakes
    (post_id, profile_id, house_slug, stake, status)
  values
    (p_post_id, p_profile_id, p_house_slug, p_stake, 'escrowed')
  on conflict (post_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- Already escrowed by an earlier attempt. Nothing to do and nothing to
    -- undo; the caller treats this as success because the stake is held.
    return jsonb_build_object('ok', true, 'escrowed', 0, 'reason', 'already');
  end if;

  -- points only. See the header: renown, glory, season_rating and tier are
  -- deliberately untouched in both directions.
  update public.profiles
     set points = points - p_stake
   where id = p_profile_id;

  insert into public.points_ledger
    (profile_id, points_delta, glory_delta, reason, ref, category)
  values
    (p_profile_id, -p_stake, 0, 'call_stake_escrowed', p_post_id, 'stake');

  return jsonb_build_object('ok', true, 'escrowed', p_stake, 'reason', 'held');
end;
$$;

-- ============================================================
-- 6. settle_call_stake
-- ============================================================
--
-- Resolves one escrow, once. The call_stakes row lock is both the mutual
-- exclusion and the idempotency check: whoever takes it first finds status
-- 'escrowed' and settles, and every later caller finds something else and
-- returns having changed nothing. The verdict cron already guards the Call
-- itself with a conditional UPDATE, so this is the second of two independent
-- reasons a Call cannot pay out twice.
--
-- p_score is S, the difficulty adjusted Call score, already clamped to
-- [-100, +100] by lib/calls/scoring.ts. The bonus multiplies the two integers
-- before dividing, which is exactly what lib/calls/stake.ts does, so the
-- number the composer promised and the number paid here are the same number.
-- Dividing first would put a binary float against Postgres numeric and the two
-- would disagree on every half.

create or replace function public.settle_call_stake(
  p_post_id uuid,
  p_verdict text,
  p_score integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stake public.call_stakes%rowtype;
  v_bonus integer := 0;
  v_returned integer := 0;
  v_burned integer := 0;
  v_tithe integer := 0;
  v_pardon integer := 0;
  v_perk_id uuid;
  v_allowance bigint;
  v_treasury bigint;
begin
  select * into v_stake
    from public.call_stakes
   where post_id = p_post_id
   for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'no_stake');
  end if;
  if v_stake.status <> 'escrowed' then
    -- A replay. The first settlement already happened and stands.
    return jsonb_build_object('settled', false, 'reason', 'already');
  end if;

  if p_verdict = 'hit' then
    v_bonus := round(
      v_stake.stake::numeric * least(greatest(coalesce(p_score, 0), 0), 100) / 100
    );
    v_returned := v_stake.stake + v_bonus;

  elsif p_verdict = 'void' then
    -- The realm could not settle the claim honestly. The member is neither
    -- punished for the realm's silence nor paid for a claim that never
    -- resolved, so the stake comes back whole and the bonus is zero.
    v_returned := v_stake.stake;

  else
    v_burned := v_stake.stake;
    if v_stake.house_slug is not null then
      v_tithe := floor(v_burned::numeric * 5000 / 10000);
    end if;
  end if;

  if v_returned > 0 then
    perform 1 from public.profiles where id = v_stake.profile_id for update;
    update public.profiles
       set points = points + v_returned
     where id = v_stake.profile_id;
    insert into public.points_ledger
      (profile_id, points_delta, glory_delta, reason, ref, category)
    values
      (
        v_stake.profile_id,
        v_returned,
        0,
        case when p_verdict = 'hit' then 'call_stake_won' else 'call_stake_void' end,
        p_post_id,
        'stake'
      );
  end if;

  if v_burned > 0 then
    -- The half that pools. The other half is simply never credited anywhere,
    -- which is what makes this a sink: those points left the member's balance
    -- and no row anywhere gains them.
    if v_tithe > 0 then
      perform 1 from public.houses where slug = v_stake.house_slug for update;
      update public.houses
         set treasury = treasury + v_tithe
       where slug = v_stake.house_slug;
      insert into public.house_treasury_ledger
        (house_slug, delta, reason, ref, actor_id)
      values
        (v_stake.house_slug, v_tithe, 'call_stake_burned', p_post_id, null);
    end if;

    -- The Warden's Pardon, if the House has one burning. Soonest to expire
    -- first, so a House running two overlapping pardons spends the one that
    -- would otherwise lapse. The refund is half the burn, capped at 250 a
    -- Call, and bounded by both the perk's ring-fenced allowance and the
    -- treasury's actual balance, so it can never overdraw either.
    if v_stake.house_slug is not null then
      select id, allowance_remaining into v_perk_id, v_allowance
        from public.house_perks
       where house_slug = v_stake.house_slug
         and perk = 'wardens-pardon'
         and starts_at <= now()
         and expires_at > now()
         and coalesce(allowance_remaining, 0) > 0
       order by expires_at asc
       limit 1
       for update;

      if v_perk_id is not null then
        select treasury into v_treasury
          from public.houses where slug = v_stake.house_slug for update;

        v_pardon := least(
          floor(v_burned::numeric * 5000 / 10000),
          250,
          v_allowance,
          coalesce(v_treasury, 0)
        );

        if v_pardon > 0 then
          update public.house_perks
             set allowance_remaining = allowance_remaining - v_pardon
           where id = v_perk_id;

          update public.houses
             set treasury = treasury - v_pardon
           where slug = v_stake.house_slug;

          insert into public.house_treasury_ledger
            (house_slug, delta, reason, ref, actor_id)
          values
            (v_stake.house_slug, -v_pardon, 'wardens_pardon', p_post_id, v_stake.profile_id);

          perform 1 from public.profiles where id = v_stake.profile_id for update;
          update public.profiles
             set points = points + v_pardon
           where id = v_stake.profile_id;

          insert into public.points_ledger
            (profile_id, points_delta, glory_delta, reason, ref, category)
          values
            (v_stake.profile_id, v_pardon, 0, 'wardens_pardon', p_post_id, 'stake');
        end if;
      end if;
    end if;
  end if;

  update public.call_stakes
     set status = case when v_burned > 0 then 'burned' else 'returned' end,
         bonus = v_bonus,
         returned = v_returned,
         burned = v_burned,
         tithe = v_tithe,
         pardon = v_pardon,
         settled_at = now()
   where post_id = p_post_id;

  return jsonb_build_object(
    'settled', true,
    'stake', v_stake.stake,
    'bonus', v_bonus,
    'returned', v_returned,
    'burned', v_burned,
    'tithe', v_tithe,
    'pardon', v_pardon
  );
end;
$$;

-- ============================================================
-- 7. spend_house_treasury
-- ============================================================
--
-- Buys one perk for one House, or refuses. Three things have to be true at the
-- same instant and stay true while the row is written, which is why they are
-- one function under the houses row lock: the actor is the Lord or the Hand of
-- that House on an OPEN oath, the House can afford it, and the same perk is
-- not already burning.
--
-- WHO MAY SPEND, ENFORCED HERE. The Lord and the Hand are the top two
-- contributors this season, computed from what they actually did and rotated
-- automatically when the season turns (lib/houses/scoring.ts). Everyone would
-- mean the fastest member decides; an admin would undo the zero-admin design
-- Houses are built on; one person would freeze a treasury the moment they went
-- quiet. The role is read from house_members here rather than trusted from the
-- request, because a client that can name its own role is a client that can
-- spend any House's treasury.
--
-- The price is computed by the caller from the catalogue in
-- lib/houses/perks.ts, which is server-only code holding the service-role key.
-- It is bounded here rather than recomputed, because the catalogue is prose
-- and prices, and duplicating it in PL/pgSQL would guarantee the two copies
-- drift.

create or replace function public.spend_house_treasury(
  p_house_slug text,
  p_actor_id uuid,
  p_perk text,
  p_cost bigint,
  p_duration_days integer,
  p_allowance boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_treasury bigint;
  v_existing uuid;
  v_perk_id uuid;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_cost');
  end if;
  if p_duration_days is null or p_duration_days <= 0 or p_duration_days > 90 then
    return jsonb_build_object('ok', false, 'reason', 'bad_duration');
  end if;

  -- Serialises every treasury movement for this House, so the affordability
  -- check below and the debit further down cannot interleave with a second
  -- purchase or with a pardon being paid out of the same balance.
  select treasury into v_treasury
    from public.houses where slug = p_house_slug for update;
  if v_treasury is null then
    return jsonb_build_object('ok', false, 'reason', 'no_house');
  end if;

  select role into v_role
    from public.house_members
   where profile_id = p_actor_id
     and house_slug = p_house_slug
     and left_at is null
   limit 1;

  if v_role is null then
    return jsonb_build_object('ok', false, 'reason', 'not_sworn');
  end if;
  if v_role not in ('lord', 'hand') then
    return jsonb_build_object('ok', false, 'reason', 'not_titled');
  end if;

  select id into v_existing
    from public.house_perks
   where house_slug = p_house_slug
     and perk = p_perk
     and expires_at > now()
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_burning');
  end if;

  if v_treasury < p_cost then
    return jsonb_build_object(
      'ok', false, 'reason', 'insufficient', 'treasury', v_treasury
    );
  end if;

  insert into public.house_perks
    (house_slug, perk, cost, allowance_remaining, actor_id, starts_at, expires_at)
  values
    (
      p_house_slug,
      p_perk,
      p_cost,
      case when p_allowance then p_cost else null end,
      p_actor_id,
      now(),
      now() + make_interval(days => p_duration_days)
    )
  returning id into v_perk_id;

  update public.houses
     set treasury = treasury - p_cost
   where slug = p_house_slug;

  insert into public.house_treasury_ledger
    (house_slug, delta, reason, ref, actor_id)
  values
    (p_house_slug, -p_cost, 'perk_' || p_perk, v_perk_id, p_actor_id);

  return jsonb_build_object(
    'ok', true,
    'perk_id', v_perk_id,
    'cost', p_cost,
    'treasury', v_treasury - p_cost
  );
end;
$$;

-- ============================================================
-- 8. EXECUTE grants
-- ============================================================

revoke all on function public.escrow_call_stake(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.settle_call_stake(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.spend_house_treasury(text, uuid, text, bigint, integer, boolean)
  from public, anon, authenticated;

grant execute on function public.escrow_call_stake(uuid, uuid, integer, text)
  to service_role;
grant execute on function public.settle_call_stake(uuid, text, integer)
  to service_role;
grant execute on function public.spend_house_treasury(text, uuid, text, bigint, integer, boolean)
  to service_role;
