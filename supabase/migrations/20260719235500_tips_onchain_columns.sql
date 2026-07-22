-- On-chain tips: record real, non-custodial wallet-to-wallet transfers.
-- The tips table began as a point-tribute ledger (points NOT NULL). On-chain
-- tips carry no points, so points becomes nullable and new columns capture the
-- transfer amount, token symbol, transaction hash, and chain.

alter table public.tips
  alter column points drop not null;

alter table public.tips
  add column if not exists amount text,
  add column if not exists token text,
  add column if not exists tx_hash text,
  add column if not exists chain_id integer;

-- One recorded tip per on-chain transaction, so a double-submit of the same
-- hash cannot mint a duplicate tribute row.
create unique index if not exists tips_tx_hash_key
  on public.tips (tx_hash)
  where tx_hash is not null;
