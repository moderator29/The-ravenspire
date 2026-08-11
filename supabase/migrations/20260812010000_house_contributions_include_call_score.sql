-- Houses V2: teach House contribution about the Calls V2 currency.
--
-- WHY
-- house_season_contributions read glory_delta from points_ledger, which was
-- every reward in the realm when it was written. Calls V2 (migration
-- 20260812001000) settles a resolved Call through apply_call_score, which
-- updates profiles.season_rating directly and writes no ledger row at all. A
-- House's standing would therefore have ignored the outcome of Calls, which
-- are the flagship of the realm and the thing House Clashes are built on.
--
-- The Call's score is not lost, it is written onto the post: lib/calls/types.ts
-- documents `call.score` and `call.settled_at` on the posts row. That is a
-- stable contract and it is time-stamped, which the profiles column is not, so
-- it can be attributed to an oath window the same way a ledger row is.
--
-- The two sources are made disjoint rather than merely added. A Call that
-- carries a score has its legacy flat glory award (the `call_hit` row the
-- pre-V2 verdict job wrote) excluded, so the transition period cannot count
-- the same Call twice.
--
-- Season Rating is allowed to fall, so a contribution may now be negative. The
-- top-20 cut sorts descending, so a negative record drops out of the counted
-- set on its own rather than needing a special case.

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
  with s as (
    select * from public.seasons where id = p_season_id
  ),
  ledger as (
    select
      l.profile_id,
      l.created_at,
      l.glory_delta::numeric as amount
    from public.points_ledger l
    cross join s
    where l.created_at >= s.starts_at
      and l.created_at < s.ends_at
      and l.glory_delta > 0
      and not exists (
        select 1
        from public.posts p
        where p.id = l.ref
          and p.kind = 'call'
          and jsonb_typeof(p.call -> 'score') = 'number'
      )
  ),
  scored_calls as (
    select
      p.author_id as profile_id,
      coalesce((p.call ->> 'settled_at')::timestamptz, p.created_at) as created_at,
      (p.call ->> 'score')::numeric as amount
    from public.posts p
    cross join s
    where p.kind = 'call'
      and p.deleted = false
      and jsonb_typeof(p.call -> 'score') = 'number'
      and coalesce(p.call ->> 'verdict', 'open') <> 'open'
      and coalesce((p.call ->> 'settled_at')::timestamptz, p.created_at) >= s.starts_at
      and coalesce((p.call ->> 'settled_at')::timestamptz, p.created_at) < s.ends_at
  ),
  contributions as (
    select * from ledger
    union all
    select * from scored_calls
  )
  select
    hm.house_slug,
    c.profile_id,
    sum(c.amount)::bigint as glory,
    min(hm.sworn_at) as sworn_at
  from contributions c
  join public.house_members hm
    on hm.profile_id = c.profile_id
   and c.created_at >= hm.sworn_at
   and (hm.left_at is null or c.created_at < hm.left_at)
  group by hm.house_slug, c.profile_id
$$;

revoke all on function public.house_season_contributions(integer)
  from public, anon, authenticated;
grant execute on function public.house_season_contributions(integer)
  to service_role;
