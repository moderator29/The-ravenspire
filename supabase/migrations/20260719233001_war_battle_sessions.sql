-- War battle session model: server issues a pending row on start with a seed
-- and started_at, then settles it once on finish. Guards against scripted
-- infinite Glory by making battle rows single use and wall clock verifiable.
alter table public.war_battles
  add column if not exists seed bigint,
  add column if not exists started_at timestamptz default now(),
  add column if not exists settled boolean not null default true;

-- Pending rows created on start have no result yet.
alter table public.war_battles alter column result drop not null;

-- Speed up the per profile hourly rate limit and settlement lookups.
create index if not exists war_battles_profile_created_idx
  on public.war_battles (profile_id, created_at desc);
