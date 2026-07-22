-- Season settlement snapshots. When an admin settles a season, each member's
-- final earned standing is frozen into a row here: their POINTS at close, plus
-- Renown and Glory and their rank. This is the ledger the realm will later
-- convert to $RSP; for now it stays entirely in points and no $RSP figure is
-- computed or surfaced.
--
-- Private table (mirrors public.mutes): RLS denies direct client access; the
-- admin routes read and write through the service-role client.
create table if not exists public.season_settlements (
  id uuid primary key default gen_random_uuid(),
  season_id integer not null references public.seasons (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null default 0,
  renown integer not null default 0,
  glory integer not null default 0,
  rank integer not null,
  settled_at timestamptz not null default now(),
  unique (season_id, profile_id)
);

create index if not exists season_settlements_season_idx
  on public.season_settlements (season_id, rank);

alter table public.season_settlements enable row level security;

create policy "season_settlements no direct client access"
  on public.season_settlements for select using (false);
