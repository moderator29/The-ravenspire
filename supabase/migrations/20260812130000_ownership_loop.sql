-- The ownership loop: the holdings ledger and the non-custodial claim.
--
-- WHY
-- Everything the collectibles realm promises rests on one sentence: what you
-- earn or buy is yours, in your own wallet, and the platform cannot take it
-- back. Until now the realm had no ledger of holdings at all. The collectibles
-- foundation migration deliberately left `inventory` unbuilt with a note that
-- a ledger must never exist before the only thing allowed to write it. This
-- migration builds the ledger and the mechanism that carries a holding out of
-- the database and into the member's own wallet, so the two arrive together.
--
-- THE LOOP, END TO END
--   1. A server flow grants a holding (chest opening, reward, redemption,
--      purchase). It writes `inventory`, server-authoritative, same law as
--      points: the client is told, never asked.
--   2. The member asks to claim it. The server issues a signed EIP-712
--      voucher naming their own wallet, the token, the amount and a deadline,
--      and records it in `collectible_claims` as `issued`.
--   3. The member's own wallet executes the mint. The platform never holds a
--      key, never holds a token, and pays no gas on their behalf.
--   4. The member submits the transaction hash. The server reads the receipt
--      from the chain, checks it landed, checks it came from that member's
--      wallet, checks it hit the right contract and moved the right token to
--      them, and only then marks the claim `minted`. The client is never
--      believed. That is what `claim_confirm` below exists to make atomic.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No contract address, no chain, no signer. Nothing mints until the set is
-- final and the founder deploys the contracts, and nothing on-chain is
-- retractable. The tables carry the columns the mint will need and every
-- route refuses honestly until the configuration exists. Sealed, not faked.
--
-- RLS
-- Deny by default to every browser role, the same posture as the collectibles
-- foundation and for the same architectural reason: this stack authenticates
-- with Privy, so auth.uid() is always null and an owner policy written against
-- it would match nothing and protect nothing. Ownership is enforced in the
-- routes, which resolve the member from a verified Privy token and read and
-- write with the service role.

-- ------------------------------------------------------------------
-- 1. The launch switch for the mint.
-- ------------------------------------------------------------------

-- A fourth chapter switch beside reliquary_live, chests_live and mercer_live.
-- Off, like the others, and it stays off until contracts exist on a real
-- chain. Never re-seals a flag an operator has since flipped.
insert into public.realm_flags (key, enabled)
values ('mint_live', false)
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 2. The holdings ledger.
-- ------------------------------------------------------------------
--
-- The catalog is code, not database (lib/collectibles/set-one.ts derives the
-- forty cards from the champion roster, the single source of truth). So a
-- holding names its item by set slug and item slug rather than by a foreign
-- key into a `collectibles` table that no writer populates. A slug pair cannot
-- drift from the roster the way a duplicated row can, and the identity that
-- reaches the chain is derived from the same pair
-- (lib/collectibles/token-ids.ts), frozen once, forever.
--
-- Crests are not here. They already have a ledger, public.user_crests, earned
-- and server-written, and a second ledger for the same fact is a second answer
-- to the same question. Crest claims read that table directly.

create table if not exists public.inventory (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  set_slug text not null,
  item_slug text not null,
  kind text not null default 'card'::text,
  -- Duplicates are real and expected: chests pull from odds, not from a
  -- checklist. A second copy of a card increments qty rather than adding a row.
  qty integer not null default 1,
  -- How many of those copies have been carried on-chain and verified. Bumped
  -- only by claim_confirm, only after the receipt has been read. It can never
  -- exceed qty, which is what stops a member minting more than they hold.
  minted_qty integer not null default 0,
  acquired_via text not null,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_pkey primary key (id),
  constraint inventory_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint inventory_profile_item_key unique (profile_id, set_slug, item_slug),
  constraint inventory_set_slug_check
    check (set_slug <> ''::text and char_length(set_slug) <= 60),
  constraint inventory_item_slug_check
    check (item_slug <> ''::text and char_length(item_slug) <= 60),
  constraint inventory_kind_check
    check (kind = any (array['card'::text, 'relic'::text])),
  constraint inventory_qty_check check (qty > 0),
  constraint inventory_minted_qty_check
    check (minted_qty >= 0 and minted_qty <= qty),
  -- Every way a holding can legitimately arrive. 'market' is the native
  -- secondary market, which does not exist yet; it is listed because an
  -- acquisition route that is not on this list is a bug, and the constraint
  -- should say so rather than silently accept a typo.
  constraint inventory_acquired_via_check
    check (acquired_via = any (array[
      'chest'::text,
      'reward'::text,
      'purchase'::text,
      'redemption'::text,
      'market'::text
    ]))
);

-- The Hoard reads a member's holdings, newest first.
create index if not exists inventory_profile_acquired_idx
  on public.inventory (profile_id, acquired_at desc);

-- "Who holds this card" for the trophy case and, later, the market.
create index if not exists inventory_item_idx
  on public.inventory (set_slug, item_slug);

-- ------------------------------------------------------------------
-- 3. The claim ledger.
-- ------------------------------------------------------------------
--
-- One row per voucher issued. The row IS the audit trail: what was signed,
-- for whom, to which wallet, against which contract, and what happened next.
-- A voucher is a promise the platform made and can be held to.

create table if not exists public.collectible_claims (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  -- 'card' claims read public.inventory. 'crest' claims read
  -- public.user_crests. Nothing else is claimable.
  subject_kind text not null,
  -- For a card: the set. For a crest: the literal 'crests', because a crest
  -- belongs to the realm rather than to a printed set.
  set_slug text not null,
  item_slug text not null,
  qty integer not null default 1,
  -- The member's own wallet, captured at issue time and checked again against
  -- the transaction sender at confirm time. A voucher is bound to one address;
  -- it cannot be handed to somebody else's wallet.
  wallet_address text not null,
  chain_id integer not null,
  contract text not null,
  -- The frozen on-chain identity of the item, as text because a uint256 does
  -- not fit in a bigint.
  token_id text not null,
  -- The signed voucher exactly as handed to the client, signature included, so
  -- a dispute can be settled by reading the row rather than by re-deriving it.
  voucher jsonb not null default '{}'::jsonb,
  -- The replay guard. Unique across the table and carried inside the signed
  -- payload, so the same voucher cannot be redeemed twice even if the contract
  -- is careless.
  nonce text not null,
  -- issued -> submitted -> minted, or issued -> expired, or void when an
  -- operator revokes it. A claim never returns to issued.
  status text not null default 'issued'::text,
  tx_hash text,
  verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collectible_claims_pkey primary key (id),
  constraint collectible_claims_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint collectible_claims_nonce_key unique (nonce),
  constraint collectible_claims_subject_kind_check
    check (subject_kind = any (array['card'::text, 'crest'::text])),
  constraint collectible_claims_set_slug_check check (set_slug <> ''::text),
  constraint collectible_claims_item_slug_check check (item_slug <> ''::text),
  constraint collectible_claims_qty_check check (qty > 0),
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

-- "Is this item already claimed" for the Hoard and the claim route.
create index if not exists collectible_claims_item_idx
  on public.collectible_claims (profile_id, subject_kind, set_slug, item_slug);

-- One transaction hash settles one claim. A partial unique index rather than a
-- plain unique constraint because many claims legitimately carry a null hash,
-- and because a hash on a voided claim should not block the real one.
create unique index if not exists collectible_claims_tx_hash_idx
  on public.collectible_claims (tx_hash)
  where tx_hash is not null;

-- Only one live voucher per member per item at a time. Re-asking while one is
-- outstanding returns the outstanding one rather than minting a second right
-- to the same thing. Partial, because settled and dead claims must be free to
-- accumulate as history.
create unique index if not exists collectible_claims_open_idx
  on public.collectible_claims (profile_id, subject_kind, set_slug, item_slug)
  where status = any (array['issued'::text, 'submitted'::text]);

-- ------------------------------------------------------------------
-- 4. Confirming a claim, atomically.
-- ------------------------------------------------------------------
--
-- The route reads the chain and decides whether the mint is real. This
-- function is what makes the consequence indivisible: the claim flips to
-- minted and the holding's minted_qty rises in one statement pair inside one
-- transaction, under a row lock, or neither happens.
--
-- Without this the two writes are separate round trips from a serverless
-- route, and a crash between them leaves a claim that says minted over a
-- ledger that says nothing was, or a double submit that bumps minted_qty
-- twice for one transaction. The guard is expressed as a WHERE clause on the
-- status so the check and the act cannot be separated: only a claim still in
-- issued or submitted can become minted, so a replayed confirm is a no-op that
-- reports false rather than a second increment.
--
-- EXECUTE is granted to service_role ONLY. Supabase exposes every public
-- function over PostgREST at /rest/v1/rpc/<name> and the anon key ships in the
-- browser bundle, so a public grant here would let anyone mark their own
-- claims minted. See 20260811090000_revoke_public_execute_on_economy_rpcs.sql
-- for the incident this rule comes from.

create or replace function public.claim_confirm(
  p_claim_id uuid,
  p_tx_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.collectible_claims%rowtype;
begin
  -- Lock the claim for the length of the transaction. Two confirms racing on
  -- the same claim serialise here, and the second finds it already minted.
  select * into v_claim
    from public.collectible_claims
   where id = p_claim_id
     and status in ('issued', 'submitted')
   for update;

  if not found then
    return false;
  end if;

  update public.collectible_claims
     set status = 'minted',
         tx_hash = p_tx_hash,
         verified_at = now(),
         updated_at = now()
   where id = p_claim_id;

  -- Cards settle against the holdings ledger. Crests settle against
  -- user_crests, which has nothing to increment: holding the crest is the
  -- fact, and the claim row is the record that it was carried on-chain.
  if v_claim.subject_kind = 'card' then
    update public.inventory
       set minted_qty = least(qty, minted_qty + v_claim.qty),
           updated_at = now()
     where profile_id = v_claim.profile_id
       and set_slug = v_claim.set_slug
       and item_slug = v_claim.item_slug;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_confirm(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_confirm(uuid, text) to service_role;

-- ------------------------------------------------------------------
-- 5. RLS: both ledgers sealed to the browser.
-- ------------------------------------------------------------------

alter table public.inventory enable row level security;
alter table public.collectible_claims enable row level security;

-- Deny by default, made explicit. A member reads their own holdings and their
-- own claims through /api/inventory and /api/claims, which resolve them from a
-- verified Privy token; an auth.uid() owner policy here would match nothing.
-- Nothing in the product lets a browser write either table: a holdings ledger
-- the holder can write is not a ledger.
drop policy if exists "inventory owner only" on public.inventory;
create policy "inventory owner only"
  on public.inventory for select using (false);

drop policy if exists "claims owner only" on public.collectible_claims;
create policy "claims owner only"
  on public.collectible_claims for select using (false);

revoke all on public.inventory from anon, authenticated;
revoke all on public.collectible_claims from anon, authenticated;
