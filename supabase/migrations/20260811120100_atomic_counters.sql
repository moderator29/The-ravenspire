-- B6: atomic counters.
--
-- Every counter in the app was moved with a read-modify-write from the route:
-- SELECT like_count, then UPDATE like_count = value + 1. Two requests landing
-- in the same window both read the same value and both write value + 1, so one
-- increment is simply lost. On the War state the same shape is worse than a
-- lost count: "chests >= 1" was checked in the route and decremented in a
-- separate statement, so two concurrent opens could both pass the check and
-- both grant a chest from a purse of one. The same held for spending gold.
--
-- These follow the increment_profile_totals pattern from 20260719233003: one
-- statement, the new value derived from the current row inside the update, and
-- the guard expressed as a WHERE clause so the check and the act cannot be
-- separated. Where a guard exists, the function reports whether it fired, so
-- the route can answer honestly instead of assuming it won.
--
-- EXECUTE is granted to service_role ONLY. Supabase exposes every public
-- function over PostgREST at /rest/v1/rpc/<name>, and the anon key ships in the
-- browser bundle, so a public grant here would let anyone mint War gold, unlock
-- champions, or inflate any raven's counts. See
-- 20260811090000_revoke_public_execute_on_economy_rpcs.sql for the incident
-- this rule comes from.

-- ---------------------------------------------------------------------------
-- Ravens and comments
-- ---------------------------------------------------------------------------

-- One statement for every raven counter. Pass only the deltas that apply; the
-- rest default to zero. Counters are floored at zero so an un-like arriving
-- before its like can never drive a count negative.
create or replace function public.bump_post_counts(
  p_post_id uuid,
  p_likes integer default 0,
  p_replies integer default 0,
  p_reposts integer default 0,
  p_views integer default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update public.posts
     set like_count   = greatest(0, like_count   + p_likes),
         reply_count  = greatest(0, reply_count  + p_replies),
         repost_count = greatest(0, repost_count + p_reposts),
         view_count   = greatest(0, view_count   + p_views)
   where id = p_post_id;
$$;

create or replace function public.bump_comment_likes(
  p_comment_id uuid,
  p_delta integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.comments
     set like_count = greatest(0, like_count + p_delta)
   where id = p_comment_id;
$$;

-- ---------------------------------------------------------------------------
-- Houses
-- ---------------------------------------------------------------------------

create or replace function public.bump_house_members(
  p_slug text,
  p_delta integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.houses
     set member_count = greatest(0, member_count + p_delta)
   where slug = p_slug;
$$;

-- ---------------------------------------------------------------------------
-- The War
-- ---------------------------------------------------------------------------

-- The daily tribute. The "already claimed today" check lives in the WHERE
-- clause, so a double tap cannot pay twice however close together it lands.
-- Returns true only for the call that actually paid.
create or replace function public.war_claim_daily(
  p_profile_id uuid,
  p_today date,
  p_gold integer,
  p_chests integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  update public.war_state
     set last_daily = p_today,
         gold = gold + p_gold,
         chests = chests + p_chests,
         updated_at = now()
   where profile_id = p_profile_id
     and (last_daily is null or last_daily <> p_today)
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

-- Open one relic chest. The purse check is the WHERE clause, so two opens
-- racing on a single chest cannot both succeed. p_unlock is appended only when
-- the champion is not already sworn, so a replay cannot duplicate a roster
-- entry. Returns true only for the call that actually opened a chest.
create or replace function public.war_open_chest(
  p_profile_id uuid,
  p_gold integer,
  p_unlock text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opened boolean;
begin
  update public.war_state
     set chests = chests - 1,
         gold = gold + p_gold,
         unlocked_champions = case
           when p_unlock is null or p_unlock = any(unlocked_champions)
           then unlocked_champions
           else array_append(unlocked_champions, p_unlock)
         end,
         updated_at = now()
   where profile_id = p_profile_id
     and chests >= 1
  returning true into v_opened;
  return coalesce(v_opened, false);
end;
$$;

-- Spend gold at the forge and record the new mastery in the same statement, so
-- gold can never leave the purse without the level arriving. Returns true only
-- when the purse actually covered the cost.
create or replace function public.war_spend_gold(
  p_profile_id uuid,
  p_cost integer,
  p_mastery jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent boolean;
begin
  update public.war_state
     set gold = gold - p_cost,
         mastery = p_mastery,
         updated_at = now()
   where profile_id = p_profile_id
     and gold >= p_cost
  returning true into v_spent;
  return coalesce(v_spent, false);
end;
$$;

-- Bank one settled battle. Returns the running totals so the route can report
-- the true post-battle standing rather than the values it read beforehand.
create or replace function public.war_settle_battle(
  p_profile_id uuid,
  p_victory boolean,
  p_glory integer,
  p_gold integer
) returns table (battles integer, wins integer, war_glory integer, gold integer)
language sql
security definer
set search_path = public
as $$
  update public.war_state
     set battles = battles + 1,
         wins = wins + case when p_victory then 1 else 0 end,
         war_glory = war_glory + p_glory,
         gold = gold + p_gold,
         updated_at = now()
   where profile_id = p_profile_id
  returning battles, wins, war_glory, gold;
$$;

-- ---------------------------------------------------------------------------
-- Grants: the service role and nothing else.
-- ---------------------------------------------------------------------------

revoke all on function public.bump_post_counts(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.bump_comment_likes(uuid, integer) from public, anon, authenticated;
revoke all on function public.bump_house_members(text, integer) from public, anon, authenticated;
revoke all on function public.war_claim_daily(uuid, date, integer, integer) from public, anon, authenticated;
revoke all on function public.war_open_chest(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.war_spend_gold(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.war_settle_battle(uuid, boolean, integer, integer) from public, anon, authenticated;

grant execute on function public.bump_post_counts(uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.bump_comment_likes(uuid, integer) to service_role;
grant execute on function public.bump_house_members(text, integer) to service_role;
grant execute on function public.war_claim_daily(uuid, date, integer, integer) to service_role;
grant execute on function public.war_open_chest(uuid, integer, text) to service_role;
grant execute on function public.war_spend_gold(uuid, integer, jsonb) to service_role;
grant execute on function public.war_settle_battle(uuid, boolean, integer, integer) to service_role;
