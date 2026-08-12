-- Houses V2, part 2: size-neutral House scoring.
--
-- WHY
-- Six Houses of unequal membership summed across every member is a headcount
-- contest, not a skill contest. Section 11.1b takes the fix competitive team
-- ladders converged on: Lichess scores a team battle as the sum of its top N
-- members only, which is exactly size neutral. Ravenspire uses N = 20 and
-- breaks ties on those members' mean.
--
-- Attribution is derived, never copied. A member's contribution to a House is
-- the glory they earned from points_ledger while an oath to that House was
-- open. That makes three rules from section 11.1 true by construction:
--
--   * contributions already made stay with the House that earned them, since
--     the ledger row's created_at falls inside the closed oath window;
--   * they never transfer, since nothing is ever rewritten;
--   * a switcher's contribution to the new House starts at 0, since no ledger
--     row predating the new oath can fall inside it.
--
-- house_season_scores is a cache of the resolved standing, recomputed by
-- /api/houses/recompute. It is the only House number that is stored, and it is
-- always reproducible from the ledger.

-- ------------------------------------------------------------------
-- Per-member contribution for one season, attributed by oath window.
-- ------------------------------------------------------------------

create or replace function public.house_season_contributions(p_season_id integer)
returns table (
  house_slug text,
  profile_id uuid,
  glory bigint,
  sworn_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    hm.house_slug,
    l.profile_id,
    sum(l.glory_delta)::bigint as glory,
    min(hm.sworn_at) as sworn_at
  from public.points_ledger l
  join public.seasons s
    on s.id = p_season_id
  join public.house_members hm
    on hm.profile_id = l.profile_id
   and l.created_at >= hm.sworn_at
   and (hm.left_at is null or l.created_at < hm.left_at)
  where l.created_at >= s.starts_at
    and l.created_at < s.ends_at
    and l.glory_delta > 0
  group by hm.house_slug, l.profile_id
$$;

-- Read-only, but it reaches across the ledger and the oath history, so it is
-- kept off the PostgREST surface the anon key can reach. Server routes hold
-- the service-role key. Same posture as migration 20260811090000.
revoke all on function public.house_season_contributions(integer)
  from public, anon, authenticated;
grant execute on function public.house_season_contributions(integer)
  to service_role;

-- ------------------------------------------------------------------
-- The resolved standing.
-- ------------------------------------------------------------------

create table if not exists public.house_season_scores (
  season_id integer not null references public.seasons (id) on delete cascade,
  house_slug text not null references public.houses (slug) on delete cascade,
  -- Sum of the top 20 contributors' season contribution.
  score bigint not null default 0,
  -- Mean of those same contributors. Breaks ties on score.
  mean numeric(12, 2) not null default 0,
  -- How many members contributed anything at all. Chess.com's club-league
  -- participation lever: depth is visible next to the peak.
  contributor_count integer not null default 0,
  -- How many members were sworn when the standing was computed.
  member_count integer not null default 0,
  rank integer not null default 0,
  computed_at timestamptz not null default now(),
  constraint house_season_scores_pkey primary key (season_id, house_slug)
);

create index if not exists house_season_scores_rank_idx
  on public.house_season_scores (season_id, rank);

alter table public.house_season_scores enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'house_season_scores'
       and policyname = 'public read'
  ) then
    create policy "public read" on public.house_season_scores
      for select to public using (true);
  end if;
end $$;
