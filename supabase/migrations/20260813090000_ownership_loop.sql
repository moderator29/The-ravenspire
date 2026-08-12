-- The ownership loop: carrying a holding out of the database and into the
-- member's own wallet.
--
-- WHY
-- Everything the collectibles realm promises rests on one sentence: what you
-- earn or buy is yours, in your own wallet, and the platform cannot take it
-- back. The holdings ledger exists already (public.inventory, from the
-- commerce engine): one row per copy of a card, written by chest opening and
-- redemption, server-authoritative, same law as points. What has never existed
-- is the mechanism that takes a row in that ledger and turns it into a token
-- the member holds themselves.
--
-- THE LOOP, END TO END
--   1. A server flow grants a copy. It writes public.inventory. Already built.
--   2. The member asks to claim that copy. The server issues a signed EIP-712
--      voucher naming their own wallet, the frozen token id, and a deadline,
--      and records it here as `issued`.
--   3. The member's own wallet executes the mint. The platform never holds a
--      key, never holds a token, and pays no gas on their behalf. An unspent
--      voucher would still work if the platform vanished, which is the honest
--      test of whether a thing is custodial.
--   4. The member submits the transaction hash. The server reads the receipt
--      from the chain: it landed, it came from that member's wallet, it hit
--      the right contract, and it minted that exact token to them. Only then
--      does the claim become `minted`. The client asserts a hash and nothing
--      else (AGENTS.md rule 8, applied to the one part of the product whose
--      source of truth is not this database).
--
-- ONE CLAIM IS ONE COPY
-- The holdings ledger is per copy, not per card with a quantity, so a claim
-- points at exactly one inventory row and mints exactly one token. Three
-- copies of the same card are three claims. That costs a little chattiness and
-- buys the thing that matters here: there is never a question of how much of a
-- holding has been carried on-chain, because a copy is either claimed or it is
-- not, and a partial unique index makes a second claim on the same copy
-- impossible to write.
--
-- CRESTS
-- A crest claim points at no inventory row. public.user_crests is already the
-- ledger of who earned what, and a second ledger for the same fact is a second
-- answer to the same question. Crests mint against a separate soulbound
-- contract: a crest is a record of something a member did, and one that can be
-- sold is a record of something somebody paid for, which is a different object
-- with the same picture.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No contract address, no chain, no signer. Those are founder decisions with
-- permanent consequences, and nothing on-chain is retractable. The columns the
-- mint will need exist; the routes above refuse honestly until the
-- configuration and the mint_live flag are both present. Sealed, not faked.
--
-- RLS
-- Deny by default to every browser role, the same posture as the collectibles
-- foundation and the commerce engine, and for the same architectural reason:
-- this stack authenticates with Privy, so auth.uid() is always null and an
-- owner policy written against it would match nothing and protect nothing.
-- Ownership is enforced in the routes, which resolve the member from a
-- verified Privy token and read and write with the service role.

-- ------------------------------------------------------------------
-- 1. The launch switch for the mint.
-- ------------------------------------------------------------------

-- A fourth chapter switch beside reliquary_live, chests_live and mercer_live.
-- Off, and it stays off until contracts exist on a real chain and the set is
-- final. Never re-seals a flag an operator has since flipped.
insert into public.realm_flags (key, enabled)
values ('mint_live', false)
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 2. The claim ledger.
-- ------------------------------------------------------------------
--
-- One row per voucher issued. The row IS the audit trail: what was signed, for
-- whom, to which wallet, against which contract, and what happened next. A
-- voucher is a promise the platform made and can be held to.

create table if not exists public.collectible_claims (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  -- 'card' claims point at one row of public.inventory. 'crest' claims read
  -- public.user_crests. Nothing else is claimable.
  subject_kind text not null,
  -- The exact copy being carried on-chain, for a card. Cascade rather than
  -- restrict: if a holding is ever removed the claim history for it goes with
  -- it, because a claim to a copy that no longer exists is not history, it is
  -- a dangling assertion of ownership.
  inventory_id uuid,
  -- Denormalised so the claim reads on its own, and because the token id is
  -- derived from exactly this pair (lib/collectibles/token-ids.ts). For a
  -- crest the set is the literal 'crests': a crest belongs to the realm rather
  -- than to a printed set.
  set_slug text not null,
  item_slug text not null,
  -- The member's own wallet, captured when the voucher is signed and checked
  -- again against the transaction sender when it is confirmed. A voucher is
  -- bound to one address; it cannot be handed to somebody else's wallet.
  wallet_address text not null,
  chain_id integer not null,
  contract text not null,
  -- The frozen on-chain identity, as text because a uint256 does not fit in a
  -- bigint.
  token_id text not null,
  -- The signed voucher exactly as handed to the client, signature included, so
  -- a dispute is settled by reading the row rather than by re-deriving it.
  voucher jsonb not null default '{}'::jsonb,
  -- The replay guard. Unique here and carried inside the signed payload, so
  -- the same voucher cannot be spent twice even if the contract is careless.
  nonce text not null,
  -- issued -> submitted -> minted, or issued -> expired, or void when an
  -- operator revokes one. A claim never returns to issued.
  status text not null default 'issued'::text,
  tx_hash text,
  verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collectible_claims_pkey primary key (id),
  constraint collectible_claims_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint collectible_claims_inventory_id_fkey
    foreign key (inventory_id) references public.inventory (id) on delete cascade,
  constraint collectible_claims_nonce_key unique (nonce),
  constraint collectible_claims_subject_kind_check
    check (subject_kind = any (array['card'::text, 'crest'::text])),
  -- A card claim names a copy. A crest claim never does. Written as an
  -- equivalence so neither half can drift from the other.
  constraint collectible_claims_inventory_pair_check
    check ((subject_kind = 'card'::text) = (inventory_id is not null)),
  constraint collectible_claims_set_slug_check check (set_slug <> ''::text),
  constraint collectible_claims_item_slug_check check (item_slug <> ''::text),
  -- Lowercase hex, checked at the database edge as well as in the route. An
  -- address that reaches the chain wrong is a token sent to nobody.
  constraint collectible_claims_wallet_check
    check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint collectible_claims_contract_check
    check (contract ~ '^0x[0-9a-f]{40}$'),
  constraint collectible_claims_chain_id_check check (chain_id > 0),
  constraint collectible_claims_token_id_check
    check (token_id ~ '^[0-9]{1,78}$'),
  constraint collectible_claims_nonce_check
    check (nonce ~ '^0x[0-9a-f]{64}$'),
  constraint collectible_claims_tx_hash_check
    check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint collectible_claims_status_check
    check (status = any (array[
      'issued'::text,
      'submitted'::text,
      'minted'::text,
      'expired'::text,
      'void'::text
    ])),
  -- A minted claim has both a hash and a verification time. The pair arrives
  -- together or not at all, the same shape as redemptions.
  constraint collectible_claims_minted_pair_check
    check (
      status <> 'minted'::text
      or (tx_hash is not null and verified_at is not null)
    )
);

-- A member's claim history, newest first.
create index if not exists collectible_claims_profile_created_idx
  on public.collectible_claims (profile_id, created_at desc);

-- "Is this copy already on-chain" for the Hoard, and, later, for the market:
-- a card the member no longer holds off-chain must not be listable off-chain.
create index if not exists collectible_claims_inventory_idx
  on public.collectible_claims (inventory_id)
  where inventory_id is not null;

-- One transaction hash settles one claim. Partial rather than a plain unique
-- constraint because most claims carry a null hash, and because a hash left on
-- a voided claim must not block the real one.
create unique index if not exists collectible_claims_tx_hash_idx
  on public.collectible_claims (tx_hash)
  where tx_hash is not null;

-- A copy of a card is claimed once, ever. Issued and submitted are open
-- promises and minted is a settled one, and none of the three may be joined by
-- a second. Only a dead claim (expired or void) frees the copy to be claimed
-- again, which is exactly what expiry is for.
create unique index if not exists collectible_claims_live_card_idx
  on public.collectible_claims (inventory_id)
  where inventory_id is not null
    and status = any (array['issued'::text, 'submitted'::text, 'minted'::text]);

-- The same law for crests, keyed by the crest itself since there is no copy
-- row to point at. A member holds one of each crest, so they claim one of each.
create unique index if not exists collectible_claims_live_crest_idx
  on public.collectible_claims (profile_id, item_slug)
  where subject_kind = 'crest'::text
    and status = any (array['issued'::text, 'submitted'::text, 'minted'::text]);

-- ------------------------------------------------------------------
-- 3. RLS: the claim ledger is sealed to the browser.
-- ------------------------------------------------------------------

alter table public.collectible_claims enable row level security;

-- Deny by default, made explicit. A member reads their own claims through
-- /api/claims, which resolves them from a verified Privy token; an auth.uid()
-- owner policy here would match nothing. Nothing in the product lets a browser
-- write this table: a claim the claimant can write is not a claim, it is a
-- self-issued licence to mint.
drop policy if exists "claims owner only" on public.collectible_claims;
create policy "claims owner only"
  on public.collectible_claims for select using (false);

revoke all on public.collectible_claims from anon, authenticated;
