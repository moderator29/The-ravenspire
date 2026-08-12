-- Houses V2, part 3: House Clashes.
--
-- WHY
-- Section 11.3: standings tables are not events. Lichess team battles and
-- Chess.com club matches work because they are scheduled, bounded, and have a
-- live scoreboard. A Clash is a 48 hour window on one nominated token or
-- theme. Only Calls made inside that window count.
--
-- No new scoring maths and no entries table. A Clash entry is simply a Call
-- (a posts row with kind = 'call') whose created_at falls inside the window
-- and whose token matches the nomination. Its worth to the House is the glory
-- that Call actually earned in points_ledger when the verdict job settled it,
-- which is the same currency the season standings use.
--
-- Because entries are derived, a Clash cannot drift out of sync with the Calls
-- engine, and a deleted or edited Call is reflected immediately.

create table if not exists public.house_clashes (
  id uuid not null default gen_random_uuid(),
  title text not null,
  -- Exactly one of these. A token Clash counts Calls on that token only; a
  -- theme Clash counts every Call made inside the window.
  token text,
  theme text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  season_id integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint house_clashes_pkey primary key (id),
  constraint house_clashes_season_id_fkey
    foreign key (season_id) references public.seasons (id) on delete set null,
  constraint house_clashes_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null,
  constraint house_clashes_window_check check (ends_at > starts_at),
  constraint house_clashes_subject_check check (
    (token is not null and theme is null) or (token is null and theme is not null)
  )
);

create index if not exists house_clashes_window_idx
  on public.house_clashes (starts_at desc);

alter table public.house_clashes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'house_clashes'
       and policyname = 'public read'
  ) then
    create policy "public read" on public.house_clashes
      for select to public using (true);
  end if;
end $$;

-- ------------------------------------------------------------------
-- The live scoreboard, per contributor.
-- ------------------------------------------------------------------
--
-- Returns one row per member who made a qualifying Call, attributed to the
-- House they were sworn to at the moment they made it. glory is the settled
-- worth; the verdict counts are what make the board live before anything has
-- settled at all.

create or replace function public.house_clash_contributions(p_clash_id uuid)
returns table (
  house_slug text,
  profile_id uuid,
  glory bigint,
  calls integer,
  hits integer,
  misses integer,
  open_calls integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with clash as (
    select * from public.house_clashes where id = p_clash_id
  ),
  entries as (
    select
      p.id,
      p.author_id,
      p.created_at,
      coalesce(p.call ->> 'verdict', 'open') as verdict
    from public.posts p
    cross join clash c
    where p.kind = 'call'
      and p.deleted = false
      and p.created_at >= c.starts_at
      and p.created_at < c.ends_at
      and (c.token is null or upper(p.call ->> 'token') = upper(c.token))
  ),
  scored as (
    select
      e.author_id,
      e.created_at,
      e.verdict,
      coalesce((
        select sum(l.glory_delta)
        from public.points_ledger l
        where l.ref = e.id and l.glory_delta > 0
      ), 0) as glory
    from entries e
  )
  select
    hm.house_slug,
    s.author_id as profile_id,
    sum(s.glory)::bigint as glory,
    count(*)::integer as calls,
    count(*) filter (where s.verdict = 'hit')::integer as hits,
    count(*) filter (where s.verdict = 'miss')::integer as misses,
    count(*) filter (where s.verdict = 'open')::integer as open_calls
  from scored s
  join public.house_members hm
    on hm.profile_id = s.author_id
   and s.created_at >= hm.sworn_at
   and (hm.left_at is null or s.created_at < hm.left_at)
  group by hm.house_slug, s.author_id
$$;

revoke all on function public.house_clash_contributions(uuid)
  from public, anon, authenticated;
grant execute on function public.house_clash_contributions(uuid)
  to service_role;
