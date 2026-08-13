-- THE REALM GETS A CLOCK: the Muster, the weekly Clash, and the season close.
--
-- WHY
-- Nothing in Ravenspire happens at a time. Every act in the product is
-- available at every hour of every day, so no day is different from any other
-- and no member has ever had a reason to come back on a particular one. Three
-- appointments close that hole, and all three need something from the database
-- that application code cannot provide on its own: an act that either happens
-- exactly once or does not happen at all.
--
--   The Muster    a daily window. Claimed once per UTC day, under a row lock.
--   The Clash     a weekly window. Opened once per ISO week, settled once ever.
--   The Season    the close. Freezes and resets in ONE transaction, or neither.
--
-- The clock itself (which hours, which weekday, how long a vigil pays) lives in
-- lib/realm/appointments.ts with its own tests and its own module load
-- assertions. Nothing here re-derives it. This file is the settling, and the
-- settling is the part that has to be indivisible. Same division of labour as
-- public.chest_open and public.craft_cards: the module decides, the function
-- makes it happen exactly once.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT TOUCH
-- points_ledger_category_check. The Muster is paid through the existing
-- 'social' category on purpose, not through a new 'muster' one, and the reason
-- is economic rather than cosmetic: a new category would come with a new daily
-- allowance, and a new allowance is new Renown minted every day forever for
-- opening an app (award_capped adds Glory to Renown, and Renown never falls).
-- Reusing 'social' means the Muster spends an allowance the member already
-- had. It costs the realm nothing it was not already paying. A pleasant side
-- effect is that the constraint this repository has now twice nearly broken by
-- re-adding it from a stale reading does not need to be touched at all.
--
-- The live constraint was read out of the database before this was written and
-- is ('social', 'call', 'war', 'stake'), which matches
-- 20260815120000_call_stakes_and_house_treasury.sql exactly. Repository and
-- database agree. Checked, not assumed.

-- ============================================================
-- 1. The Muster: the daily window
-- ============================================================
--
-- Three columns on profiles rather than a table. A member has exactly one
-- vigil, one last-mustered day and one best, so a table would be one row per
-- member with a unique key on the member, which is a column set with extra
-- steps and an extra join on the busiest read in the product.
--
-- muster_day is a date and not a timestamp on purpose. The claim key is the
-- UTC DAY, because a member claims a day and not a window: catching the second
-- window after missing the first is the same claim, and storing the instant
-- would invite a later reader to compare instants and get that wrong.
--
-- It is a SEPARATE count from profiles.streak, which /api/streak advances for
-- simply opening the app at any hour. They measure different things: that one
-- is "did you show up", this one is "were you here when the realm was". Paying
-- the vigil crest off the plain streak would hand a thirty day devotion crest
-- to somebody who has never once caught a window.

alter table public.profiles
  add column if not exists muster_day date;

alter table public.profiles
  add column if not exists muster_streak integer not null default 0;

-- The longest vigil ever held, kept after a break. The crest is the real
-- permanent record, but a member who reached twenty nine and missed a day is
-- entitled to have the realm remember it rather than silently resetting them
-- to zero as though it never happened.
alter table public.profiles
  add column if not exists muster_best integer not null default 0;

-- ------------------------------------------------------------------
-- The claim, atomically.
-- ------------------------------------------------------------------
--
-- WHY THIS IS ONE FUNCTION AND NOT THREE WRITES FROM A ROUTE
-- A claim is: check the day has not already been claimed, advance the vigil,
-- and pay the Glory. From a serverless route that is at least three round
-- trips, and every ordering of a crash between them is bad in a different way.
-- Mark the day first and crash, and the member has spent their daily claim and
-- been paid nothing, with no way for anybody to tell afterwards whether they
-- were paid. Pay first and crash, and the day is unclaimed and the payment can
-- be repeated for as long as the member keeps retrying. Under a row lock in
-- one transaction, both are impossible.
--
-- The same lock is the idempotency guarantee. Two requests arriving in the
-- same millisecond do not both see an unclaimed day: the second blocks on the
-- lock the first is holding, and when it proceeds it reads muster_day already
-- equal to p_day and returns claimed = false. There is no window between a
-- check and a write for them to race in, because there is no window.
--
-- WHY THE REWARD CURVE IS PASSED IN
-- p_base, p_step and p_max come from lib/realm/appointments.ts, where they are
-- asserted at module load against the real daily social allowance. Copying
-- them into plpgsql would create a second set of numbers to disagree with the
-- first, which is exactly how a reward curve ends up meaning two things.
--
-- WHY IT RETURNS jsonb RATHER THAN RAISING
-- "You already mustered today" is not an error, it is the answer. A raise
-- would roll back a transaction that did nothing wrong and would force the
-- route to parse an error string to tell the two normal outcomes apart.

create or replace function public.claim_muster(
  p_profile_id uuid,
  p_day date,
  p_base integer,
  p_step integer,
  p_max integer,
  p_daily_cap integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
  v_streak integer;
  v_best integer;
  v_offered integer;
  v_award jsonb;
begin
  -- The lock, taken before anything is read, so the read below cannot be
  -- overtaken between reading and writing.
  select muster_day, muster_streak, muster_best
    into v_last, v_streak, v_best
    from public.profiles
   where id = p_profile_id
     for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'no_profile');
  end if;

  v_streak := greatest(coalesce(v_streak, 0), 0);
  v_best := greatest(coalesce(v_best, 0), 0);

  if v_last = p_day then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'already_claimed',
      'streak', v_streak,
      'best', v_best
    );
  end if;

  -- Yesterday extends the vigil. Anything else, including a first ever claim,
  -- starts a new one at day one. Mirrors advanceVigil in TypeScript, which is
  -- the version with the tests on it; this is the version that cannot be
  -- raced.
  if v_last = p_day - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;
  v_best := greatest(v_best, v_streak);

  v_offered := least(p_base + p_step * (v_streak - 1), p_max);
  if v_offered < 0 then
    v_offered := 0;
  end if;

  update public.profiles
     set muster_day = p_day,
         muster_streak = v_streak,
         muster_best = v_best
   where id = p_profile_id;

  -- Paid through the existing capped award, under the existing 'social'
  -- allowance, so the Muster mints nothing. See the header. A member who has
  -- already spent their day is paid zero and told so, which is the honest
  -- answer and not a failure: they have already earned their day.
  v_award := public.award_capped(
    p_profile_id, 0, v_offered, 'muster', null::uuid, p_daily_cap, 'social'
  );

  return jsonb_build_object(
    'claimed', true,
    'streak', v_streak,
    'best', v_best,
    -- What the vigil was worth, and what the allowance actually paid. Both,
    -- because a surface that shows only the second cannot explain the zero and
    -- a surface that shows only the first is lying.
    'offered', v_offered,
    'glory', coalesce((v_award ->> 'glory')::integer, 0),
    'capped', coalesce((v_award ->> 'capped')::boolean, false)
  );
end;
$$;

-- Service role only, like every other economy function in the realm. A member
-- who can call their own claim can call it from a clock they control.
revoke all on function public.claim_muster(uuid, date, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_muster(uuid, date, integer, integer, integer, integer)
  to service_role;

-- ============================================================
-- 2. The Clash: a schedule, and a settlement that happens once
-- ============================================================
--
-- house_clashes shipped with a window, a subject and a live scoreboard, and no
-- schedule and no ending. Every Clash had to be typed by a steward, which in
-- practice meant none was ever called: the table is empty in production to
-- this day. And nothing ever happened when one closed, so a finished Clash was
-- indistinguishable from an abandoned one.

-- The ISO week this Clash was scheduled for, and the scheduler's whole
-- idempotency story. Null for a Clash a steward called by hand, which is still
-- allowed and is not on the calendar.
alter table public.house_clashes
  add column if not exists scheduled_week text;

-- One scheduled Clash per ISO week, enforced by an index rather than by a
-- read-then-write in the job. A cron that overlaps itself, or a platform that
-- delivers the same invocation twice, races a guard written in application
-- code and does not race a unique index. Partial, so hand called Clashes carry
-- null and never collide with each other.
create unique index if not exists house_clashes_scheduled_week_idx
  on public.house_clashes (scheduled_week)
  where scheduled_week is not null;

-- When the result was frozen. Null means the Clash has never been settled,
-- which is the only state settle_house_clash will act on.
alter table public.house_clashes
  add column if not exists settled_at timestamptz;

-- Finding the Clashes a settlement pass has to look at, without scanning.
create index if not exists house_clashes_unsettled_idx
  on public.house_clashes (ends_at)
  where settled_at is null;

-- ------------------------------------------------------------------
-- The frozen result.
-- ------------------------------------------------------------------
--
-- WHY A CLOSED CLASH IS FROZEN AND A LIVE ONE IS DERIVED
-- house_clash_contributions derives the board from posts and points_ledger,
-- and the original migration is right that this is the correct design for a
-- LIVE board: a deleted or edited Call is reflected immediately, and the board
-- can never drift out of sync with the Calls engine.
--
-- It is the wrong design for a FINISHED one. A result that keeps recomputing
-- is a result that changes: a member deleting a Call in November silently
-- rewrites who won a Clash in August, and a House that lost can be handed a
-- retroactive victory by somebody tidying their profile. History has to stop
-- moving when it becomes history. So the moment a Clash settles, its board is
-- copied out of the derivation and never derived again.

create table if not exists public.house_clash_results (
  clash_id uuid not null,
  house_slug text not null,
  -- 1 is the winner. Every House gets a row, including the ones that entered
  -- nothing, because a board that omits the Houses that did not turn up cannot
  -- be told apart from a board that was never computed.
  rank integer not null,
  -- The sum of this House's top N contributors, the same size neutral rule the
  -- live board and the season standings both use. N travels in from the caller
  -- so there is exactly one definition of it (HOUSE_TOP_N in lib/data/houses).
  score bigint not null default 0,
  counted integer not null default 0,
  mean numeric not null default 0,
  contributor_count integer not null default 0,
  calls integer not null default 0,
  hits integer not null default 0,
  settled_at timestamptz not null default now(),
  constraint house_clash_results_pkey primary key (clash_id, house_slug),
  constraint house_clash_results_clash_id_fkey
    foreign key (clash_id) references public.house_clashes (id) on delete cascade,
  constraint house_clash_results_rank_check check (rank >= 1)
);

create index if not exists house_clash_results_rank_idx
  on public.house_clash_results (clash_id, rank);

alter table public.house_clash_results enable row level security;

-- A settled Clash board is public: it is the realm's own record of a public
-- competition, and the live board it replaces was already readable by anyone.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'house_clash_results'
       and policyname = 'public read'
  ) then
    create policy "public read" on public.house_clash_results
      for select to public using (true);
  end if;
end $$;

-- Readable, never writable. Nothing in the product lets a browser write a
-- competition result.
revoke insert, update, delete, truncate on public.house_clash_results
  from anon, authenticated;

-- ------------------------------------------------------------------
-- The settlement, exactly once.
-- ------------------------------------------------------------------
--
-- WHY A CLASH PAYS NOTHING
-- The obvious design is a Glory bonus for the winning House, and it is wrong.
-- A Clash score IS Glory, already earned and already paid by the very Calls
-- that make up the board: every point on it went through award() when the
-- verdict job settled that Call. Paying it a second time at settlement would
-- credit the same act twice and would make winning a Clash the cheapest Glory
-- in the realm, which is how a competition turns into a farm.
--
-- Nor can it pay POINTS into the House treasury: that treasury holds real
-- POINTS burned by real members staking real Calls
-- (20260815120000_call_stakes_and_house_treasury.sql), and minting into it
-- would put invented balance beside earned balance in the same column.
--
-- So a Clash pays a record, permanently, and that is the honest whole of it. A
-- House that won the Clash of week 33 won it forever, and nothing anybody does
-- afterwards can take it away or hand it to somebody else. That is worth more
-- than a bonus that devalues the currency it is paid in.
--
-- WHY IT CANNOT SETTLE TWICE
-- The row lock plus the conditional read. The function takes FOR UPDATE on the
-- clash row and then re-checks settled_at under it, so a second invocation
-- arriving while the first is still inside the transaction blocks, and then
-- reads the settled_at the first one wrote. The primary key on
-- (clash_id, house_slug) is the second line of defence: even a settlement that
-- somehow reached the insert twice cannot produce two boards.
--
-- WHY IT CANNOT SETTLE EARLY
-- ends_at is re-checked here against the DATABASE clock, never against a time
-- passed in. A job whose host clock is an hour fast must not be able to close
-- a Clash an hour early and freeze a board that Calls were still arriving in.

create or replace function public.settle_house_clash(
  p_clash_id uuid,
  p_top_n integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clash public.house_clashes%rowtype;
  v_rows integer := 0;
  v_winner text;
  v_winner_score bigint := 0;
  v_entrants integer := 0;
begin
  select * into v_clash
    from public.house_clashes
   where id = p_clash_id
     for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'not_found');
  end if;

  if v_clash.settled_at is not null then
    return jsonb_build_object('settled', false, 'reason', 'already_settled');
  end if;

  -- The database's clock, not the caller's.
  if v_clash.ends_at > now() then
    return jsonb_build_object('settled', false, 'reason', 'still_open');
  end if;

  with contributions as (
    select * from public.house_clash_contributions(p_clash_id)
  ),
  ranked as (
    select
      c.*,
      row_number() over (
        partition by c.house_slug
        -- profile_id last, so the cut at N is deterministic when two members
        -- finish a Clash on identical figures. Without it the board could
        -- differ between two runs of a settlement that is supposed to be
        -- reproducible.
        order by c.glory desc, c.hits desc, c.profile_id
      ) as seat
    from contributions c
  ),
  per_house as (
    select
      h.slug as house_slug,
      coalesce(sum(r.glory) filter (where r.seat <= p_top_n), 0)::bigint as score,
      count(*) filter (where r.seat <= p_top_n)::integer as counted,
      count(r.profile_id)::integer as contributor_count,
      coalesce(sum(r.calls), 0)::integer as calls,
      coalesce(sum(r.hits), 0)::integer as hits
    from public.houses h
    left join ranked r on r.house_slug = h.slug
    group by h.slug
  ),
  placed as (
    select
      p.*,
      case when p.counted > 0 then round(p.score::numeric / p.counted, 2) else 0 end as mean,
      row_number() over (
        order by p.score desc, p.calls desc, p.house_slug
      ) as place
    from per_house p
  )
  insert into public.house_clash_results (
    clash_id, house_slug, rank, score, counted, mean, contributor_count, calls, hits
  )
  select
    p_clash_id, placed.house_slug, placed.place, placed.score, placed.counted,
    placed.mean, placed.contributor_count, placed.calls, placed.hits
  from placed
  -- Belt to the primary key's braces. A settlement that somehow re-entered
  -- writes nothing rather than failing the whole transaction.
  on conflict (clash_id, house_slug) do nothing;

  get diagnostics v_rows = row_count;

  select house_slug, score into v_winner, v_winner_score
    from public.house_clash_results
   where clash_id = p_clash_id and rank = 1;

  select count(*) into v_entrants
    from public.house_clash_results
   where clash_id = p_clash_id and calls > 0;

  update public.house_clashes
     set settled_at = now()
   where id = p_clash_id;

  return jsonb_build_object(
    'settled', true,
    'clash_id', p_clash_id,
    'houses', v_rows,
    -- Null when nobody entered. A Clash that closed with no Calls in it has no
    -- winner, and naming the alphabetically first House as one would be an
    -- invented result.
    'winner', case when v_entrants > 0 then v_winner else null end,
    'winner_score', case when v_entrants > 0 then v_winner_score else 0 end,
    'entrant_houses', v_entrants
  );
end;
$$;

revoke all on function public.settle_house_clash(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.settle_house_clash(uuid, integer)
  to service_role;

-- ============================================================
-- 3. The season close
-- ============================================================
--
-- WHAT BANKS, WHAT RESETS, WHAT A MEMBER KEEPS FOREVER
--
--   Banks    every member's final rank, POINTS, Renown and Glory, frozen into
--            season_settlements. One row, permanent, never recomputed.
--   Resets   Glory, and Glory alone, on profiles and on houses.
--   Keeps    Renown, POINTS, every card, every crest, every ledger row, and
--            the settlement row itself.
--
-- WHY GLORY IS THE ONLY THING THAT RESETS
-- Because it is the only thing that can. Renown never falls: that is the first
-- law of the realm's economy and it is why Renown is worth earning at all.
-- POINTS are an earned balance the realm intends to honour, so confiscating
-- them at a season boundary would be taking something a member was told they
-- had kept. Cards and crests are property, held non custodially, and the
-- platform could not take them back if it wanted to.
--
-- Glory is different, and it always was: it is described everywhere in the
-- product as a House's SEASONAL standing. A season in which nothing resets is
-- not a season, it is a leaderboard with a name, and the House that led in
-- month one leads forever because nobody can catch a number that only grows.
--
-- WHY THE FREEZE AND THE RESET MUST BE ONE TRANSACTION
-- The reset destroys exactly the numbers the freeze is recording. From a route
-- that is two statements, and a crash between them is unrecoverable in the
-- worst possible way: either every member's final Glory has been zeroed with
-- no record of what it was, or the record exists and the new season starts
-- with last season's scores still on the board. Neither is repairable
-- afterwards, because the evidence is what was destroyed.
--
-- WHY A SECOND RUN CANNOT ZERO THE RECORD
-- This is the subtle one and it is the reason the status check is not
-- negotiable. season_settlements is keyed on (season_id, profile_id), so a
-- second run would UPSERT over the frozen rows, and by then every member's
-- Glory is zero, so it would overwrite the whole season's record with zeroes
-- and rank the realm alphabetically. The status is moved to 'settled' inside
-- the same transaction and re-read under the row lock, so a second run refuses
-- before it reads a single profile. p_force exists to close a season EARLY and
-- deliberately does not bypass the status check: force means "close it now",
-- never "close it again".
--
-- WHY THE RANK IS ON GLORY AND NOT ON POINTS
-- The admin settle action has always ranked the season by POINTS. POINTS are a
-- lifetime balance that never resets, so ranking a season by them means the
-- top of the table is the same every season forever and the ranks measure how
-- long somebody has been here rather than what they did. A season is ranked by
-- the season's own currency. The admin route now calls this function, so the
-- realm has one settlement path and cannot hold two opinions about who won.

alter table public.seasons
  add column if not exists settled_at timestamptz;

create or replace function public.close_season(
  p_season_id integer,
  -- How many of the top ranks earn `champion-of-the-season`. Named for what it
  -- is rather than reusing "top n", which means the House contributor cut
  -- everywhere else in this file and would be a genuinely dangerous thing to
  -- confuse: passing twenty here would crown twenty champions.
  p_champion_ranks integer,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons%rowtype;
  v_members integer := 0;
  v_total_points bigint := 0;
  v_champions jsonb := '[]'::jsonb;
begin
  select * into v_season
    from public.seasons
   where id = p_season_id
     for update;

  if not found then
    return jsonb_build_object('closed', false, 'reason', 'not_found');
  end if;

  -- Never bypassed, not even by force. See the header: a second close would
  -- overwrite the frozen record with the zeroes the first one wrote.
  if v_season.status <> 'active' then
    return jsonb_build_object(
      'closed', false, 'reason', 'not_active', 'status', v_season.status
    );
  end if;

  -- The database's clock. A scheduled job with a fast host clock must not be
  -- able to end a season early on every member in it.
  if not p_force and (v_season.ends_at is null or v_season.ends_at > now()) then
    return jsonb_build_object('closed', false, 'reason', 'not_due');
  end if;

  -- 1. Freeze. Ranked on the season's own currency, then on permanent standing
  --    and lifetime balance to break ties, then on id so the order is
  --    reproducible rather than whatever the planner felt like.
  with eligible as (
    select
      id,
      greatest(coalesce(points, 0), 0) as points,
      greatest(coalesce(renown, 0), 0) as renown,
      greatest(coalesce(glory, 0), 0) as glory
    from public.profiles
    where is_banned = false
      and is_agent = false
      and onboarded = true
  ),
  ranked as (
    select
      e.*,
      row_number() over (
        order by e.glory desc, e.renown desc, e.points desc, e.id
      ) as place
    from eligible e
  )
  insert into public.season_settlements
    (season_id, profile_id, points, renown, glory, rank)
  select p_season_id, r.id, r.points, r.renown, r.glory, r.place
  from ranked r
  on conflict (season_id, profile_id) do update
    set points = excluded.points,
        renown = excluded.renown,
        glory = excluded.glory,
        rank = excluded.rank,
        settled_at = now();

  get diagnostics v_members = row_count;

  select coalesce(sum(points), 0) into v_total_points
    from public.season_settlements
   where season_id = p_season_id;

  -- 2. The champions, read back out of the frozen rows rather than recomputed,
  --    so the crest and the record can never name different members.
  --    A member on zero Glory is not a champion of anything: a season nobody
  --    played has no podium, and handing out a legendary crest for finishing
  --    first among people who all scored nothing would make it worthless.
  select coalesce(jsonb_agg(jsonb_build_object('profile_id', s.profile_id, 'rank', s.rank)
           order by s.rank), '[]'::jsonb)
    into v_champions
    from public.season_settlements s
   where s.season_id = p_season_id
     and s.rank <= p_champion_ranks
     and s.glory > 0;

  -- 3. Reset, in the same transaction that recorded what is being reset.
  --    Every profile, including agents and banned accounts that are excluded
  --    from the settlement, because houses.glory has to stay consistent with
  --    the members under it and a skipped row would leave a permanent phantom.
  update public.profiles set glory = 0 where glory <> 0;
  update public.houses set glory = 0 where glory <> 0;

  -- 4. Close. Read back under the same lock by any later invocation.
  update public.seasons
     set status = 'settled',
         settled_at = now()
   where id = p_season_id;

  return jsonb_build_object(
    'closed', true,
    'season_id', p_season_id,
    'name', v_season.name,
    'members', v_members,
    'total_points', v_total_points,
    'champions', v_champions
  );
end;
$$;

revoke all on function public.close_season(integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.close_season(integer, integer, boolean)
  to service_role;

-- ============================================================
-- 4. The event spine
-- ============================================================
--
-- clash.settled joins the once-only kinds. It is written by a scheduled job,
-- which is precisely the shape 20260812100000_periodic_event_idempotency.sql
-- exists for: a job that runs more often than the card should appear races a
-- guard written in application code, and does not race a unique index.
--
-- Its subject is the clash id, which is already unique, so one Clash produces
-- one settlement card however many times the job is invoked.
--
-- clash.opened is still deliberately absent from this list, for the reason the
-- original migration gave: a Clash is authored, and stewards may legitimately
-- call two on the same token in different weeks. The scheduled Clash needs no
-- entry either, because its uniqueness is enforced upstream by
-- house_clashes_scheduled_week_idx: one row per ISO week means one card.

drop index if exists public.realm_events_once_idx;

create unique index if not exists realm_events_once_idx
  on public.realm_events (kind, subject_id, coalesce(actor_id::text, ''::text))
  where subject_id is not null
    and kind = any (array[
      'call.sealed'::text,
      'call.resolved'::text,
      'crest.earned'::text,
      'duel.opened'::text,
      'quest.completed'::text,
      'oath.sworn'::text,
      'season.milestone'::text,
      'standings.snapshot'::text,
      'discussion.trending'::text,
      'clash.settled'::text
    ]);
