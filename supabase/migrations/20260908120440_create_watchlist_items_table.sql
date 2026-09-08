-- Coin watchlist (the bookmark star on Scrying Glass rows and the coin page),
-- made server-authoritative so a member's starred coins follow them across
-- devices instead of living only in one browser's localStorage.
--
-- Private-table style (mirrors public.mutes / public.bookmarks / public.trades):
-- RLS denies direct client access; all reads and writes flow through the
-- service-role admin client from a members-only route. Composite primary key,
-- the same idea as public.bookmarks, so identity is the row itself and no
-- separate surrogate id column is needed. A watched coin is identified by
-- (chain_id, address), not address alone, so the same address on two
-- different chains never collides.
create table if not exists public.watchlist_items (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  chain_id integer not null,
  -- Always lowercased and trimmed at write time (see app/api/watchlist/route.ts),
  -- so a checksum-cased and lowercased address never split into two rows.
  address text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, chain_id, address)
);

-- List-by-member read (GET /api/watchlist).
create index if not exists watchlist_items_profile_id_idx
  on public.watchlist_items (profile_id);

alter table public.watchlist_items enable row level security;

-- Deny all direct client access; the admin client (service role) bypasses this.
create policy "watchlist_items no direct client access" on public.watchlist_items
  for select using (false);
