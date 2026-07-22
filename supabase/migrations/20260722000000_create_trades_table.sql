-- Platform-wide trade feed. Every in-app buy, sell and swap (0x, non-custodial)
-- records a receipt here after the chain returns a tx hash, so the realm has a
-- shared, real transaction feed alongside each member's own Vault history.
--
-- Private-table style (mirrors public.mutes / public.bookmarks): RLS denies
-- direct client access; all reads and writes flow through the service-role
-- admin client, which bypasses RLS. The feed is served by a members-only route.
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- 'buy' and 'sell' are market trades on a coin page; 'swap' is token-to-token.
  kind text not null check (kind in ('buy', 'sell', 'swap')),
  chain_id integer not null,
  tx_hash text not null,
  -- The token sold and the token bought, in human units as text (numeric-safe).
  sell_symbol text,
  sell_amount text,
  sell_contract text,
  buy_symbol text,
  buy_amount text,
  buy_contract text,
  -- Approximate USD value of the trade, for display only. Null when unknown.
  usd_value numeric,
  created_at timestamptz not null default now()
);

-- One receipt per on-chain transaction, so a double-submit of the same hash
-- cannot mint a duplicate row.
create unique index if not exists trades_tx_hash_key on public.trades (tx_hash);
create index if not exists trades_created_at_idx on public.trades (created_at desc);
create index if not exists trades_profile_id_idx on public.trades (profile_id);

alter table public.trades enable row level security;

-- Deny all direct client access; the admin client (service role) bypasses this.
create policy "trades no direct client access" on public.trades
  for select using (false);
