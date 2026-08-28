-- Ballot privacy, two hot-path indexes, and the daily War gold ceiling.
--
-- 1. BALLOTS ARE SECRET.
-- The baseline schema gave poll_votes and duel_votes a "public read" select
-- policy, so anyone holding the anon key (which ships in the browser bundle)
-- could enumerate every member's ballots: who voted for what in every poll and
-- every duel, by voter id, forever. Both API routes read these tables with the
-- service role, which bypasses RLS, so the policies below cost the product
-- nothing; they only close the anon window. This is the same treatment
-- bookmarks, mutes and notifications already received.
do $$ begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='poll_votes' and policyname='public read')
    then drop policy "public read" on public.poll_votes; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='duel_votes' and policyname='public read')
    then drop policy "public read" on public.duel_votes; end if;
end $$;

drop policy if exists "ballots stay sealed" on public.poll_votes;
create policy "ballots stay sealed"
  on public.poll_votes for select using (false);

drop policy if exists "ballots stay sealed" on public.duel_votes;
create policy "ballots stay sealed"
  on public.duel_votes for select using (false);

-- 2. THE TWO HOTTEST UNINDEXED READS.
-- follows has a composite primary key on (follower_id, followee_id), which
-- serves "who do I follow" but not "who follows me": notifyFollowers fans a
-- notification out to every follower on every Call and every verified trade,
-- and follower counts run the same lookup, all as sequential scans. referrals
-- is keyed on profile_id alone, so a referrer reading their own banner walked
-- the table. Both indexes back reads that grow linearly with the realm.
create index if not exists follows_followee_idx
  on public.follows (followee_id);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id);

-- 3. THE DAILY WAR GOLD CEILING.
-- Glory from the War got its daily cap in 20260812233847; gold did not, so
-- the grind that cap ended was still worth running for the currency that buys
-- chests and mastery upgrades. The tally lives on war_state (a day column and
-- a spent-today counter, reset lazily when the day turns) and the clamp runs
-- inside the same statement sequence as the settle, under the row lock, so
-- two battles settling together cannot both spend the last of the day's room.
-- The route passes the cap so the number stays written down in one place
-- (lib/economy/allowances.ts) beside the Glory cap and its reasoning.
alter table public.war_state
  add column if not exists gold_today integer not null default 0,
  add column if not exists gold_day date;

create or replace function public.war_settle_battle_capped(
  p_profile_id uuid,
  p_victory boolean,
  p_glory integer,
  p_gold integer,
  p_daily_gold_cap integer
) returns table (
  battles integer,
  wins integer,
  war_glory integer,
  gold integer,
  gold_granted integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_spent integer;
  v_grant integer;
begin
  -- Lock the member's war_state row and read what the day has already paid.
  -- A row from an earlier day counts as zero spent.
  select case when ws.gold_day is distinct from v_day then 0 else ws.gold_today end
    into v_spent
    from public.war_state ws
   where ws.profile_id = p_profile_id
     for update;
  if not found then
    return;
  end if;

  v_grant := least(greatest(p_gold, 0), greatest(p_daily_gold_cap - v_spent, 0));

  return query
  update public.war_state ws
     set battles = ws.battles + 1,
         wins = ws.wins + case when p_victory then 1 else 0 end,
         war_glory = ws.war_glory + p_glory,
         gold = ws.gold + v_grant,
         gold_today = v_spent + v_grant,
         gold_day = v_day,
         updated_at = now()
   where ws.profile_id = p_profile_id
  returning ws.battles, ws.wins, ws.war_glory, ws.gold, v_grant;
end;
$$;

-- SECURITY DEFINER and it mints gold, so it is exactly the shape of the
-- exploit closed in 20260811090000: Supabase publishes every public function
-- at /rest/v1/rpc/<name> and the anon key ships in the browser bundle.
-- service_role only, and nothing else, ever.
revoke all on function public.war_settle_battle_capped(uuid, boolean, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.war_settle_battle_capped(uuid, boolean, integer, integer, integer)
  to service_role;
