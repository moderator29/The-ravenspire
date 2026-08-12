-- Calls V2: two currencies, and the anti-farming ledger category (V2 sections
-- 9.3 and 9.5).
--
-- Ravenspire collapses every reward into one monotonic ladder, so a Call that
-- misses costs nothing and a Call that lands on a coin flip pays the same as a
-- Call that lands against the odds. Section 9.3 splits that into two:
--
--   Renown         += max(0, S)   monotonic, never falls, unlocks capabilities
--   Season Rating  += S           can go negative, resets each season, standings
--
-- S is the difficulty-adjusted Call score computed in lib/calls/scoring.ts.
-- Renown keeps its existing meaning and its existing tier ladder; this migration
-- only gives it a second, skill-driven inflow and gives the realm a rating that
-- is allowed to fall.

-- ============================================================
-- profiles.season_rating
-- ============================================================

alter table public.profiles
  add column if not exists season_rating integer not null default 0;

-- profiles has no table-wide SELECT for the browser roles (see the baseline
-- schema COLUMN GRANTS section); every readable column is granted by name. A
-- new column is invisible until it is granted, and Season Rating is a public
-- standing, so grant it.
grant select (season_rating) on public.profiles to anon, authenticated;

-- Season standings read this ordered.
create index if not exists profiles_season_rating_idx
  on public.profiles (season_rating desc);

-- ============================================================
-- points_ledger.category
-- ============================================================
--
-- Anti-farming rule 4 of section 9.5: cap the daily Renown a member can draw
-- from social actions, and leave resolved Calls uncapped. That needs the ledger
-- to say which bucket a row came from. `reason` cannot do it: the social reasons
-- are dynamic strings like 'liked_by_<uuid>', so they cannot be matched with an
-- index-friendly predicate.
--
-- Null means uncategorised, which is every historical row and every award that
-- is not subject to a cap.

alter table public.points_ledger
  add column if not exists category text;

alter table public.points_ledger
  drop constraint if exists points_ledger_category_check;
alter table public.points_ledger
  add constraint points_ledger_category_check check (
    category is null or category = any (array['social'::text, 'call'::text])
  );

-- The daily social allowance query: one member, today, social rows only.
create index if not exists points_ledger_social_daily_idx
  on public.points_ledger (profile_id, created_at desc)
  where category = 'social'::text;

-- ============================================================
-- apply_call_score: the two-currency settlement
-- ============================================================
--
-- Called once per Call from the settlement cron, after the guarded verdict
-- update has already established that this process and no other owns the
-- settlement. Renown takes max(0, S) so it can never fall; Season Rating takes
-- S signed. Tier is recomputed from the new Renown inside the same statement,
-- mirroring increment_profile_totals.

create or replace function public.apply_call_score(
  p_profile_id uuid,
  p_score integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renown integer := greatest(p_score, 0);
begin
  update public.profiles
     set renown = renown + v_renown,
         season_rating = season_rating + p_score,
         tier = case
           when renown + v_renown >= 15000 then 'king'
           when renown + v_renown >= 7000 then 'hand'
           when renown + v_renown >= 3000 then 'warden'
           when renown + v_renown >= 1200 then 'lord'
           when renown + v_renown >= 400 then 'knight'
           when renown + v_renown >= 100 then 'squire'
           else 'smallfolk'
         end
   where id = p_profile_id;
end;
$$;

-- ============================================================
-- award_social_capped: the daily social Renown ceiling
-- ============================================================
--
-- The whole award has to happen inside one function. Reading the day's total in
-- TypeScript and then inserting would leave a window where two concurrent likes
-- both see room and both spend it, which is exactly the collusion path the cap
-- exists to close. Taking the profile row lock first serialises every social
-- award for a member, so the sum and the insert cannot interleave.
--
-- The allowance is spent on points before glory, because Renown is points plus
-- glory and points are the member-visible balance.
--
-- Returns the amounts actually granted so the caller can tell the member the
-- truth about what they earned.

create or replace function public.award_social_capped(
  p_profile_id uuid,
  p_points integer,
  p_glory integer,
  p_reason text,
  p_ref uuid,
  p_daily_cap integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_room integer;
  v_points integer;
  v_glory integer;
  v_house text;
begin
  if p_points <= 0 and p_glory <= 0 then
    return jsonb_build_object('points', 0, 'glory', 0, 'capped', false);
  end if;

  perform 1 from public.profiles where id = p_profile_id for update;

  select coalesce(sum(points_delta + glory_delta), 0)
    into v_used
    from public.points_ledger
   where profile_id = p_profile_id
     and category = 'social'
     and created_at >= date_trunc('day', now() at time zone 'utc');

  v_room := greatest(p_daily_cap - v_used, 0);
  if v_room <= 0 then
    return jsonb_build_object('points', 0, 'glory', 0, 'capped', true);
  end if;

  v_points := least(greatest(p_points, 0), v_room);
  v_glory := least(greatest(p_glory, 0), v_room - v_points);

  if v_points = 0 and v_glory = 0 then
    return jsonb_build_object('points', 0, 'glory', 0, 'capped', true);
  end if;

  insert into public.points_ledger
    (profile_id, points_delta, glory_delta, reason, ref, category)
  values
    (p_profile_id, v_points, v_glory, p_reason, p_ref, 'social');

  update public.profiles
     set points = points + v_points,
         glory = glory + v_glory,
         renown = renown + v_points + v_glory,
         tier = case
           when renown + v_points + v_glory >= 15000 then 'king'
           when renown + v_points + v_glory >= 7000 then 'hand'
           when renown + v_points + v_glory >= 3000 then 'warden'
           when renown + v_points + v_glory >= 1200 then 'lord'
           when renown + v_points + v_glory >= 400 then 'knight'
           when renown + v_points + v_glory >= 100 then 'squire'
           else 'smallfolk'
         end
   where id = p_profile_id
   returning house_slug into v_house;

  if v_glory > 0 and v_house is not null then
    update public.houses set glory = glory + v_glory where slug = v_house;
  end if;

  return jsonb_build_object(
    'points', v_points,
    'glory', v_glory,
    'capped', (v_points < greatest(p_points, 0) or v_glory < greatest(p_glory, 0))
  );
end;
$$;

-- ============================================================
-- EXECUTE grants
-- ============================================================
--
-- Both functions are SECURITY DEFINER and both mint Renown, so both are exactly
-- the shape of the exploit closed in 20260811090000: Supabase publishes every
-- public function at /rest/v1/rpc/<name>, and the anon key ships in the browser
-- bundle. service_role only, and nothing else, ever.

revoke all on function public.apply_call_score(uuid, integer) from public, anon, authenticated;
revoke all on function public.award_social_capped(uuid, integer, integer, text, uuid, integer) from public, anon, authenticated;

grant execute on function public.apply_call_score(uuid, integer) to service_role;
grant execute on function public.award_social_capped(uuid, integer, integer, text, uuid, integer) to service_role;

-- ============================================================
-- Read paths Calls V2 adds
-- ============================================================

-- Anti-farming rule 2: counting a member's concurrent open Calls on every Call
-- creation, and the settlement cron's per-timeframe sweep.
create index if not exists posts_open_calls_idx
  on public.posts (author_id, created_at desc)
  where kind = 'call'::text and deleted = false;
