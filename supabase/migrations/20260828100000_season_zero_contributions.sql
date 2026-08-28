-- Season Zero: the founding round's record of verified contributions.
--
-- WHY
-- The round is non-custodial: a backer sends ETH from their own wallet
-- straight to the realm treasury on Base or Ethereum mainnet, and the platform
-- never holds the funds at any point. What the platform does hold is the
-- record: which member sent which transaction, verified against the chain by
-- the server before a row is written. The raised total shown on every Season
-- Zero surface is a sum over this table, so a row here is a claim the chain
-- has already backed.
--
-- WHAT IS HERE
-- One table. No functions, no triggers, no flags. The server (service role)
-- is the only writer and the only reader; the API route in front of it does
-- the on-chain verification (app/api/season-zero/contribute) and serves the
-- public aggregate (app/api/season-zero).
--
-- THE INVARIANT: A TRANSACTION COUNTS ONCE. The unique constraint on
-- (chain_id, tx_hash) means the same on-chain transfer can never be recorded
-- twice, whoever submits it and however many times. An insert that collides
-- is answered idempotently by the route, not treated as an error.
--
-- NEW TABLE ONLY. Nothing existing is altered, so the README's
-- read-the-live-definition rule has nothing to bite on here.

create table if not exists public.season_zero_contributions (
  id uuid not null default gen_random_uuid(),
  -- The member the allocation belongs to. Matches profiles' uuid key.
  user_id uuid not null,
  -- The wallet that actually sent the ETH, read from the chain by the server,
  -- never from the client. It may differ from the member's linked wallet:
  -- the "from any wallet" path is a supported way to take part.
  wallet_address text not null,
  -- 8453 (Base) or 1 (Ethereum mainnet). Not constrained to those two values
  -- here on purpose: the allowed set is enforced by the route against
  -- lib/season-zero.ts, and a chain added there must not need a migration.
  chain_id integer not null,
  tx_hash text not null,
  -- The verified value of the transaction in wei, read from the chain.
  -- numeric because wei overflows bigint's comfort zone at nothing more than
  -- 9.3 ETH, and a hardcap contribution is above that.
  amount_wei numeric not null,
  -- 'verified' is the only state a row is born in: unverifiable submissions
  -- are refused at the route and never written. 'refunded' exists for the
  -- softcap promise: if the round closes under the softcap, every
  -- contribution is returned to its sending wallet and marked here.
  status text not null default 'verified',
  created_at timestamptz default now(),

  constraint season_zero_contributions_pkey primary key (id),
  constraint season_zero_contributions_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint season_zero_contributions_amount_check check (amount_wei > 0),
  constraint season_zero_contributions_status_check
    check (status in ('verified', 'refunded')),
  -- The invariant. One transaction, one row, ever.
  constraint season_zero_contributions_chain_tx_key unique (chain_id, tx_hash)
);

-- "Your position": every read of a member's own contributions is by user_id.
create index if not exists season_zero_contributions_user_id_idx
  on public.season_zero_contributions (user_id);

-- Deny by default, made explicit, matching the other money tables (see the
-- Bazaar schema). The aggregate is public but is served by a route reading
-- with the service role; an auth.uid() policy here would match nothing
-- because the product authenticates through Privy, not Supabase Auth. Nothing
-- in the product lets a browser touch this table directly: a contribution row
-- a client can write is a raise total a client can fabricate.
alter table public.season_zero_contributions enable row level security;

drop policy if exists "season zero contributions service role only"
  on public.season_zero_contributions;
create policy "season zero contributions service role only"
  on public.season_zero_contributions for select using (false);

revoke all on public.season_zero_contributions from anon, authenticated;
