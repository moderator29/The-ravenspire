-- Persisted per-user mute list. Mirrors the private-table style of
-- public.bookmarks: RLS denies direct client access and all reads/writes
-- flow through the service-role admin client, which bypasses RLS.
create table if not exists public.mutes (
  id uuid primary key default gen_random_uuid(),
  muter_id uuid not null references public.profiles (id) on delete cascade,
  muted_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (muter_id, muted_id)
);

create index if not exists mutes_muter_id_idx on public.mutes (muter_id);

alter table public.mutes enable row level security;

create policy "own mutes" on public.mutes for select using (false);
