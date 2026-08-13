-- The Bazaar: the native, non-custodial secondary market.
--
-- WHY
-- Members hold real cards and there is nowhere to trade one. A collection that
-- can only grow has a floor the platform stands behind and no price anybody has
-- ever paid, which makes it a subscription with pictures rather than a
-- collectibles economy. This is the market, and the whole of its design falls
-- out of one constraint.
--
-- THE CONSTRAINT: THE PLATFORM NEVER TAKES CUSTODY
-- Not of the card, not of the payment, not in escrow, not briefly, not "just
-- while it settles" (AGENTS.md rule 6). Read lib/commerce/market.ts before
-- changing anything here: it carries the full argument. The three sentences
-- that matter for this file are:
--
--   1. A LISTING IS AN INTENT, NOT A DEPOSIT. Listing does not move the card.
--      inventory.profile_id stays the seller's for the entire life of the
--      listing. There is no escrow row and no platform-owned profile. The card
--      moves exactly once, in public.market_record_payment, straight from
--      seller to buyer, in the same transaction that records the payment.
--
--   2. THE MONEY NEVER TOUCHES THE PLATFORM. The buyer's own wallet pays the
--      seller's own wallet and pays the fee to the Coffers. Nothing in this
--      schema holds a balance, because there is no balance to hold. The
--      payment columns here record hashes of transactions that happened
--      between two other parties, which is bookkeeping, not custody.
--
--   3. THE RESERVATION IS WHAT MAKES THE BUYER SAFE. An off-chain ledger row
--      and an on-chain payment cannot settle atomically, so one has to move
--      first, and the only ordering that is neither custodial nor unfair to
--      the seller is: freeze the listing to one buyer, then have them pay,
--      then move the row on proof. While a listing is reserved the seller
--      cannot cancel it, re-price it, sell it to anybody else, burn the card
--      at the crafting bench, or carry it to their own wallet. The last two
--      are enforced by triggers below rather than by a route remembering.
--
-- WHY THESE ARE FUNCTIONS AND NOT WRITES FROM A ROUTE
-- Same lesson as public.chest_open (20260813120000) and public.craft_cards
-- (20260814090000), applied to the third end of the same ledger. A settlement
-- is a read of the listing, a check of the copy, an update of the holdings
-- ledger, an update of the listing and an audit row. From a serverless route
-- that is five round trips, and a crash between any two of them leaves a buyer
-- who has paid and holds nothing, or a card moved with the listing still open
-- for a second buyer. Neither is distinguishable from the other afterwards, and
-- both cost a real member real money. Under a row lock it is all of it or none.
--
-- WHAT THE FUNCTIONS RE-CHECK, NEVER TRUSTING THE ROUTE'S READ: ownership, the
-- absence of a live claim, the absence of another live listing, the buyer not
-- being the seller, the reservation being this buyer's and unexpired, and that
-- the fee and the proceeds still add up to the price. The last one matters more
-- than it looks: a route that computed a split wrongly would otherwise short a
-- seller by a cent per sale forever, and nothing would ever fail.
--
-- A CARD CARRIED ON-CHAIN IS NOT LISTABLE, AND A LISTED CARD IS NOT CLAIMABLE
-- Once a copy has a live claim the member holds the token in their own wallet
-- and the ledger row is no longer the whole truth. Moving the row on payment
-- would sell something the platform cannot deliver, with the chain saying the
-- seller still owns it and the chain being right. So a copy with a live claim
-- is refused, exactly as public.craft_cards refuses it and with the same
-- verdict name. The reciprocal rule is enforced here too, and it is the one a
-- route would have forgotten: a card with a live listing cannot be claimed
-- on-chain, or a seller could carry a listed card to their wallet after
-- somebody had already paid for it.
--
-- Trading a card that is genuinely on-chain is a real feature and it is
-- deliberately absent: it needs a marketplace contract both parties call, so
-- the token and the payment settle atomically, and that contract is founder
-- gated and unbuilt. The alternative of having the seller send the token to
-- the platform to forward is the exact custody this whole design refuses.
--
-- RLS
-- Deny by default to every browser role, the same posture as the collectibles
-- foundation, the commerce engine, the claim ledger and the craft ledger, and
-- for the same architectural reason: this stack authenticates with Privy, so
-- auth.uid() is always null and an owner policy written against it would match
-- nothing and protect nothing. The board is public, and it is served by a route
-- reading with the service role after resolving the caller from a verified
-- Privy token.
--
-- Nothing trades today. market_live ships off, the pay token and the Coffers
-- address are unset, chest opening is sealed and the holdings ledger is empty,
-- so the routes answer honestly on all four counts.

-- ------------------------------------------------------------------
-- 1. The launch switch.
-- ------------------------------------------------------------------

-- A sixth chapter switch beside reliquary_live, chests_live, mercer_live,
-- mint_live and crafting_live. Off, and it stays off until members actually
-- hold cards: a market with nothing on it is not a feature, it is an empty
-- room. Never re-seals a flag an operator has since flipped.
insert into public.realm_flags (key, enabled)
values ('market_live', false)
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 2. A fourth way a card can enter the ledger.
-- ------------------------------------------------------------------
--
-- inventory.source answers "where did this come from", and after a sale the
-- honest answer changes: the buyer did not open this card out of a chest. The
-- constraint carried 'chest_opening' and 'redemption' from the commerce engine
-- and gained 'craft' from the card sink. Dropped and re-added rather than
-- widened in place, because a check constraint cannot be altered.
--
-- The row's previous source is not lost. market_record_payment photographs the
-- whole row into the settlement event before it overwrites anything, which is
-- the same discipline the craft ledger uses, and for the same reason: the
-- history has to survive the fact it describes.

alter table public.inventory
  drop constraint if exists inventory_source_check;
alter table public.inventory
  add constraint inventory_source_check
  check (source = any (array[
    'chest_opening'::text,
    'redemption'::text,
    'craft'::text,
    'market'::text
  ]));

-- ------------------------------------------------------------------
-- 3. The listing ledger.
-- ------------------------------------------------------------------
--
-- One row per listing, and the row carries the whole trade: what is for sale,
-- at what price, split which way, reserved by whom, paid with which
-- transactions, and settled when. A separate orders table was the other shape
-- and it is the worse one here: "one listing sells exactly once" is the single
-- most important guarantee in this schema, and it is enforced by a status on
-- one row far more simply than by a relationship between two tables.

create table if not exists public.market_listings (
  id uuid not null default gen_random_uuid(),
  seller_profile_id uuid not null,

  -- Only a card is ever listable. A crest is soulbound: it is a record of
  -- something a member did, and one that can be bought is a record of
  -- something somebody paid for, which is a different object with the same
  -- picture. lib/collectibles/token-ids.ts is the single answer to that
  -- question in code (isSoulbound), and this constraint is the independent
  -- second mechanism, because a soulbound token sold to a buyer takes their
  -- money and delivers something that cannot be transferred to them.
  subject_kind text not null default 'card',

  -- The exact copy on offer. Set null rather than cascaded if the row is ever
  -- removed: a settled listing is history and has to survive the later fate of
  -- the card it moved. A LIVE listing is protected from that outright, by the
  -- delete trigger below.
  inventory_id uuid,

  -- The card's identity, denormalised, so the board reads without a join and
  -- so a settled listing still says what was sold after any later movement.
  set_slug text not null,
  card_number integer not null,
  champion_slug text not null,
  rarity text not null,

  -- THE MONEY, in integer minor units, exactly as lib/commerce/money.ts
  -- requires. No float ever touches a price in this product. The split is
  -- frozen at listing time and honoured at settlement: the seller agreed to
  -- these numbers and the buyer was shown them, so a later change to the
  -- protocol fee must never re-price a listing that already exists.
  currency text not null default 'usd',
  price_minor integer not null,
  fee_bps integer not null,
  fee_minor integer not null,
  seller_minor integer not null,

  -- active -> reserved -> settled, or active -> cancelled. A listing never
  -- returns to active from settled, and never leaves settled at all.
  status text not null default 'active',

  -- The reservation. Every one of these is null until a buyer takes the
  -- listing, and all of them are frozen together at that moment, including
  -- where the money is to be sent. A buyer must never be able to discover
  -- mid-flow that the payee moved because an environment variable changed.
  buyer_profile_id uuid,
  buyer_wallet text,
  seller_wallet text,
  pay_chain_id integer,
  pay_token text,
  fee_wallet text,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,

  -- The two payment legs, each proven against the chain before it is written.
  -- They may hold the SAME hash: a wallet that batches calls pays the seller
  -- and the Coffers in one transaction, which is the better outcome and must
  -- not be refused.
  seller_tx_hash text,
  seller_paid_at timestamptz,
  fee_tx_hash text,
  fee_paid_at timestamptz,

  settled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint market_listings_pkey primary key (id),
  constraint market_listings_seller_fkey
    foreign key (seller_profile_id) references public.profiles (id) on delete cascade,
  constraint market_listings_buyer_fkey
    foreign key (buyer_profile_id) references public.profiles (id) on delete set null,
  constraint market_listings_inventory_fkey
    foreign key (inventory_id) references public.inventory (id) on delete set null,

  constraint market_listings_subject_kind_check check (subject_kind = 'card'::text),
  constraint market_listings_currency_check check (currency = 'usd'::text),
  constraint market_listings_set_slug_check check (set_slug <> ''::text),
  constraint market_listings_champion_slug_check check (champion_slug <> ''::text),
  constraint market_listings_card_number_check check (card_number > 0),
  constraint market_listings_rarity_check
    check (rarity = any (array['rare'::text, 'epic'::text, 'legendary'::text, 'mythic'::text])),

  -- The price bounds are the same two numbers lib/commerce/market.ts enforces,
  -- restated at the database edge. A dollar floor is what keeps the fee from
  -- rounding to nothing; the ceiling is a fat finger guard.
  constraint market_listings_price_check
    check (price_minor >= 100 and price_minor <= 10000000),
  -- A fee of zero is not a fee, and anything above ten percent is not the
  -- small, explicit fee this market promises.
  constraint market_listings_fee_bps_check check (fee_bps > 0 and fee_bps <= 1000),
  constraint market_listings_fee_minor_check check (fee_minor >= 1),
  constraint market_listings_seller_minor_check check (seller_minor >= 1),
  -- THE ARITHMETIC INVARIANT. The two halves add back up to the whole, with no
  -- cent invented and none lost. Checked in code, checked in the function, and
  -- checked here, because a split that silently loses a cent per sale is the
  -- kind of defect nobody notices until a member adds up a year of them.
  constraint market_listings_split_check
    check (fee_minor + seller_minor = price_minor),

  constraint market_listings_status_check
    check (status = any (array[
      'active'::text,
      'reserved'::text,
      'settled'::text,
      'cancelled'::text
    ])),

  -- Buying your own listing is not a trade, it is a fee paid to move a card
  -- from one hand to the same hand, and in any market with a ranking it is
  -- also how a price is faked.
  constraint market_listings_no_self_purchase_check
    check (buyer_profile_id is null or buyer_profile_id <> seller_profile_id),

  -- A listing that can still be bought must name a copy that still exists.
  constraint market_listings_live_needs_copy_check
    check (status not in ('active', 'reserved') or inventory_id is not null),

  -- Addresses and hashes, lowercase hex, checked here as well as in the route.
  -- An address that reaches the chain wrong is a payment sent to nobody.
  constraint market_listings_buyer_wallet_check
    check (buyer_wallet is null or buyer_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint market_listings_seller_wallet_check
    check (seller_wallet is null or seller_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint market_listings_pay_token_check
    check (pay_token is null or pay_token ~ '^0x[0-9a-f]{40}$'),
  constraint market_listings_fee_wallet_check
    check (fee_wallet is null or fee_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint market_listings_seller_tx_check
    check (seller_tx_hash is null or seller_tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint market_listings_fee_tx_check
    check (fee_tx_hash is null or fee_tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint market_listings_chain_check
    check (pay_chain_id is null or pay_chain_id > 0),

  -- A reserved listing knows all of it or none of it. Written as an
  -- implication so a half-populated reservation, which is a buyer who does not
  -- know where to send money, cannot exist.
  constraint market_listings_reserved_pair_check
    check (
      status <> 'reserved'::text
      or (
        buyer_profile_id is not null
        and buyer_wallet is not null
        and seller_wallet is not null
        and pay_chain_id is not null
        and pay_token is not null
        and fee_wallet is not null
        and reservation_expires_at is not null
      )
    ),

  -- A settled listing has both legs proven and a time. The pair arrives
  -- together or not at all, the same shape the claim ledger uses for a mint.
  constraint market_listings_settled_pair_check
    check (
      status <> 'settled'::text
      or (
        buyer_profile_id is not null
        and seller_tx_hash is not null
        and fee_tx_hash is not null
        and settled_at is not null
      )
    ),

  -- A recorded leg carries the time it was proven. Half a proof is not one.
  constraint market_listings_leg_time_check
    check (
      (seller_tx_hash is null) = (seller_paid_at is null)
      and (fee_tx_hash is null) = (fee_paid_at is null)
    )
);

-- ONE LISTING PER COPY, AT A TIME. This is the index that makes "a listing
-- cannot sell twice" true at the level below the application: a copy can carry
-- at most one live listing, so two sales of one card cannot both exist to
-- settle. A settled or cancelled listing is history and frees the copy, which
-- is exactly right: a card that has been sold once may be sold again by its new
-- owner.
create unique index if not exists market_listings_live_copy_idx
  on public.market_listings (inventory_id)
  where inventory_id is not null
    and status = any (array['active'::text, 'reserved'::text]);

-- The board, newest first.
create index if not exists market_listings_status_created_idx
  on public.market_listings (status, created_at desc);

-- Filtering the board by rarity, which is the only filter a card market
-- genuinely needs.
create index if not exists market_listings_rarity_idx
  on public.market_listings (rarity, status);

-- A member's own listings and their own purchases.
create index if not exists market_listings_seller_idx
  on public.market_listings (seller_profile_id, created_at desc);
create index if not exists market_listings_buyer_idx
  on public.market_listings (buyer_profile_id, created_at desc)
  where buyer_profile_id is not null;

-- ONE PAYMENT SETTLES ONE LISTING. Partial rather than plain unique because
-- most listings carry no hash at all. Two indexes rather than one across both
-- columns, deliberately: the same hash appearing in both columns of the SAME
-- row is the batched-payment case and is correct, while the same hash
-- appearing on two DIFFERENT listings is one payment being claimed twice.
create unique index if not exists market_listings_seller_tx_idx
  on public.market_listings (seller_tx_hash)
  where seller_tx_hash is not null;
create unique index if not exists market_listings_fee_tx_idx
  on public.market_listings (fee_tx_hash)
  where fee_tx_hash is not null;

alter table public.market_listings enable row level security;

-- Deny by default, made explicit. The board is public and is served by a route
-- reading with the service role; an auth.uid() policy here would match nothing.
-- Nothing in the product lets a browser write this table: a listing the seller
-- can write directly is a listing that can be settled without a payment.
drop policy if exists "market listings service role only" on public.market_listings;
create policy "market listings service role only"
  on public.market_listings for select using (false);

revoke all on public.market_listings from anon, authenticated;

-- ------------------------------------------------------------------
-- 4. The market's history.
-- ------------------------------------------------------------------
--
-- Append only, one row per thing that happened to a listing. The listing row
-- itself only ever shows its current state, and a market where nobody can
-- reconstruct what happened is a market nobody should trade in. A lapsed
-- reservation in particular leaves no trace on the listing at all, because the
-- listing simply becomes active again, so this is the only record that it ever
-- occurred.

create table if not exists public.market_events (
  id uuid not null default gen_random_uuid(),
  -- Set null rather than cascaded: the history survives the listing.
  listing_id uuid,
  -- Whose action this was. The seller for a listing or a cancellation, the
  -- buyer for a reservation or a payment.
  profile_id uuid,
  kind text not null,
  -- Everything the event needs to stand alone, denormalised, because the rows
  -- it describes may have moved or gone by the time anybody reads it. The
  -- settlement event carries the holdings row exactly as it was before the
  -- sale, which is the only place a card's pre-sale provenance survives.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint market_events_pkey primary key (id),
  constraint market_events_listing_fkey
    foreign key (listing_id) references public.market_listings (id) on delete set null,
  constraint market_events_profile_fkey
    foreign key (profile_id) references public.profiles (id) on delete set null,
  constraint market_events_kind_check
    check (kind = any (array[
      'listed'::text,
      'cancelled'::text,
      'reserved'::text,
      'reservation_lapsed'::text,
      'paid'::text,
      'settled'::text
    ])),
  constraint market_events_payload_check check (jsonb_typeof(payload) = 'object')
);

create index if not exists market_events_listing_idx
  on public.market_events (listing_id, created_at desc);
create index if not exists market_events_profile_idx
  on public.market_events (profile_id, created_at desc);

alter table public.market_events enable row level security;

drop policy if exists "market events service role only" on public.market_events;
create policy "market events service role only"
  on public.market_events for select using (false);

revoke all on public.market_events from anon, authenticated;

-- ------------------------------------------------------------------
-- 5. Listing a card.
-- ------------------------------------------------------------------
--
-- Takes a listing that lib/commerce/market.ts has already decided is legal and
-- records it exactly once, or not at all. It does not re-derive the fee rate,
-- because the rate is a product decision that lives in code, but it does
-- re-check the arithmetic that rate produced: a route that computed the split
-- wrongly would otherwise short a seller by a cent on every sale forever, and
-- nothing would ever fail.
--
-- Returns a jsonb verdict rather than raising, because a listing has several
-- honest ways to be refused and a member deserves to be told which. Every
-- refusal returns before the first write, so a refused listing leaves no trace.

create or replace function public.market_list(
  p_profile_id uuid,
  p_inventory_id uuid,
  p_price_minor integer,
  p_fee_bps integer,
  p_fee_minor integer,
  p_seller_minor integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy public.inventory%rowtype;
  v_blocked integer;
  v_listing_id uuid;
begin
  -- The arithmetic, before anything is locked. All three of these are checked
  -- in lib/commerce/market.ts as well; reaching one here means a bug in a
  -- route, and a bug in a route that decides money must not reach a table.
  if p_price_minor is null or p_price_minor < 100 or p_price_minor > 10000000 then
    return jsonb_build_object('ok', false, 'error', 'bad_price');
  end if;
  if p_fee_bps is null or p_fee_bps <= 0 or p_fee_bps > 1000 then
    return jsonb_build_object('ok', false, 'error', 'bad_fee');
  end if;
  if p_fee_minor is null or p_seller_minor is null
     or p_fee_minor < 1 or p_seller_minor < 1
     or p_fee_minor + p_seller_minor <> p_price_minor then
    return jsonb_build_object('ok', false, 'error', 'bad_split');
  end if;

  -- Lock the copy for the length of the transaction, scoped to the member in
  -- the same predicate so somebody else's card simply does not come back.
  --
  -- FOR UPDATE specifically, and it is load bearing for the same reason it is
  -- in public.craft_cards: inserting a row that references public.inventory
  -- takes a FOR KEY SHARE lock on the referenced row, and FOR KEY SHARE
  -- conflicts with FOR UPDATE. So a claim being issued at this exact moment
  -- either commits first and is seen by the check below, or blocks until this
  -- listing commits and is then refused by the claim trigger. Without it a
  -- voucher could be signed against a card that is going on sale, and the
  -- member would find out in their own wallet after paying gas.
  select * into v_copy
    from public.inventory
   where id = p_inventory_id
     and profile_id = p_profile_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  -- A copy already carried to the member's own wallet cannot be sold off
  -- chain. They hold the token, the platform never had custody of it, and
  -- moving the ledger row on payment would sell a buyer something the realm
  -- cannot deliver. Same three statuses public.craft_cards calls live, and the
  -- same verdict name, because it is the same fact.
  select count(*) into v_blocked
    from public.collectible_claims
   where inventory_id = p_inventory_id
     and status = any (array['issued'::text, 'submitted'::text, 'minted'::text]);
  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'carried_on_chain');
  end if;

  -- One live listing per copy. The partial unique index enforces it too; this
  -- is the version that produces a sentence rather than a constraint violation.
  select count(*) into v_blocked
    from public.market_listings
   where inventory_id = p_inventory_id
     and status = any (array['active'::text, 'reserved'::text]);
  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_listed');
  end if;

  -- The card's identity comes off the locked row, never off the request. A
  -- client that could name the rarity of what it is selling could sell a rare
  -- as a mythic.
  insert into public.market_listings (
    seller_profile_id, subject_kind, inventory_id,
    set_slug, card_number, champion_slug, rarity,
    price_minor, fee_bps, fee_minor, seller_minor
  )
  values (
    p_profile_id, 'card', v_copy.id,
    v_copy.set_slug, v_copy.card_number, v_copy.champion_slug, v_copy.rarity,
    p_price_minor, p_fee_bps, p_fee_minor, p_seller_minor
  )
  returning id into v_listing_id;

  insert into public.market_events (listing_id, profile_id, kind, payload)
  values (
    v_listing_id, p_profile_id, 'listed',
    jsonb_build_object(
      'inventory_id', v_copy.id,
      'champion_slug', v_copy.champion_slug,
      'rarity', v_copy.rarity,
      'price_minor', p_price_minor,
      'fee_minor', p_fee_minor,
      'seller_minor', p_seller_minor
    )
  );

  return jsonb_build_object('ok', true, 'listing_id', v_listing_id);
end;
$$;

-- ------------------------------------------------------------------
-- 6. Withdrawing a listing.
-- ------------------------------------------------------------------
--
-- A seller may take their card off the board at any time, except out from
-- under a buyer who is mid-payment. That exception is the whole of this
-- function's difficulty: a reservation that is live, or that has taken a
-- payment leg at any point, cannot be cancelled, because the buyer may already
-- have signed. A reservation that lapsed with nothing paid is not a buyer, it
-- is an abandoned intent, and the seller gets their card back.

create or replace function public.market_cancel(
  p_profile_id uuid,
  p_listing_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.market_listings%rowtype;
begin
  select * into v_listing
    from public.market_listings
   where id = p_listing_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_such_listing');
  end if;

  -- Somebody else's listing reads as not theirs, which is also the truth from
  -- where they stand.
  if v_listing.seller_profile_id <> p_profile_id then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;

  if v_listing.status = 'settled' then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;
  if v_listing.status = 'cancelled' then
    -- Idempotent rather than an error: a double tap should meet the same
    -- answer, not a failure.
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if v_listing.status = 'reserved' then
    -- Once any leg is proven the listing is never releasable, no matter how
    -- long ago the reservation was made. Releasing a listing somebody has
    -- already paid into is the one failure in this design that would actually
    -- cost a member money.
    if v_listing.seller_tx_hash is not null or v_listing.fee_tx_hash is not null then
      return jsonb_build_object('ok', false, 'error', 'payment_in_flight');
    end if;
    if v_listing.reservation_expires_at > now() then
      return jsonb_build_object('ok', false, 'error', 'reserved_now');
    end if;
    insert into public.market_events (listing_id, profile_id, kind, payload)
    values (
      p_listing_id, v_listing.buyer_profile_id, 'reservation_lapsed',
      jsonb_build_object('expired_at', v_listing.reservation_expires_at)
    );
  end if;

  update public.market_listings
     set status = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
   where id = p_listing_id;

  insert into public.market_events (listing_id, profile_id, kind, payload)
  values (p_listing_id, p_profile_id, 'cancelled', '{}'::jsonb);

  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------------
-- 7. Reserving a listing, which is where the buyer's safety comes from.
-- ------------------------------------------------------------------
--
-- Freezes one listing to one buyer, at one price, with the payees fixed, for a
-- fixed window. Nothing has been paid yet and nothing has moved. What the
-- buyer gets in exchange for the wait is the guarantee that when they do sign,
-- the trade is still there: the seller cannot cancel it, cannot re-price it,
-- cannot sell it to somebody else, cannot burn the card and cannot carry it
-- to their own wallet.
--
-- THE WALLETS ARE READ HERE, NOT PASSED IN. The route names a buyer and a
-- listing and nothing else. If a route could name the payee, then a bug or a
-- forged request in a route would be able to redirect a sale's proceeds, which
-- is the single most valuable thing an attacker could do to this system. The
-- Coffers address and the pay token do come from the caller, because they are
-- the platform's own configuration rather than anybody's property, and they
-- are frozen onto the row so a config change mid-flow cannot move where a
-- buyer was told to send money.

create or replace function public.market_reserve(
  p_listing_id uuid,
  p_buyer_profile_id uuid,
  p_chain_id integer,
  p_pay_token text,
  p_fee_wallet text,
  p_ttl_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.market_listings%rowtype;
  v_buyer_wallet text;
  v_seller_wallet text;
  v_copy_ok integer;
  v_blocked integer;
  v_expires timestamptz;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    return jsonb_build_object('ok', false, 'error', 'bad_window');
  end if;
  if p_chain_id is null or p_chain_id <= 0
     or p_pay_token !~ '^0x[0-9a-f]{40}$'
     or p_fee_wallet !~ '^0x[0-9a-f]{40}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_config');
  end if;

  select * into v_listing
    from public.market_listings
   where id = p_listing_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_such_listing');
  end if;

  if v_listing.seller_profile_id = p_buyer_profile_id then
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;
  if v_listing.status = 'settled' then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;
  if v_listing.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  -- The row has to add up before anybody is asked to pay against it.
  if v_listing.fee_minor + v_listing.seller_minor <> v_listing.price_minor then
    return jsonb_build_object('ok', false, 'error', 'amounts_disagree');
  end if;

  if v_listing.status = 'reserved' then
    if v_listing.buyer_profile_id = p_buyer_profile_id then
      -- Already theirs. Renewed rather than refused, so a member who came back
      -- to an unfinished purchase resumes it instead of losing it. Never
      -- renewed once a leg is paid: at that point the window has done its job
      -- and extending it would only move the deadline on a settled fact.
      if v_listing.seller_tx_hash is null and v_listing.fee_tx_hash is null then
        v_expires := now() + make_interval(secs => p_ttl_seconds);
        update public.market_listings
           set reservation_expires_at = v_expires,
               updated_at = now()
         where id = p_listing_id;
      else
        v_expires := v_listing.reservation_expires_at;
      end if;

      return jsonb_build_object(
        'ok', true,
        'already', true,
        'listing_id', p_listing_id,
        'price_minor', v_listing.price_minor,
        'fee_minor', v_listing.fee_minor,
        'seller_minor', v_listing.seller_minor,
        'seller_wallet', v_listing.seller_wallet,
        'fee_wallet', v_listing.fee_wallet,
        'pay_token', v_listing.pay_token,
        'pay_chain_id', v_listing.pay_chain_id,
        'expires_at', v_expires,
        'seller_paid', v_listing.seller_tx_hash is not null,
        'fee_paid', v_listing.fee_tx_hash is not null
      );
    end if;

    -- Somebody else holds it. A reservation that has taken a payment is never
    -- releasable; an unpaid one lapses on its own deadline.
    if v_listing.seller_tx_hash is not null or v_listing.fee_tx_hash is not null then
      return jsonb_build_object('ok', false, 'error', 'payment_in_flight');
    end if;
    if v_listing.reservation_expires_at > now() then
      return jsonb_build_object('ok', false, 'error', 'reserved_by_another');
    end if;

    insert into public.market_events (listing_id, profile_id, kind, payload)
    values (
      p_listing_id, v_listing.buyer_profile_id, 'reservation_lapsed',
      jsonb_build_object('expired_at', v_listing.reservation_expires_at)
    );
  end if;

  -- Both wallets, read from the profiles they belong to. A member with no
  -- wallet cannot be paid and cannot pay, and saying so plainly is far better
  -- than a trade that fails at the last step.
  select wallet_address into v_buyer_wallet
    from public.profiles where id = p_buyer_profile_id;
  select wallet_address into v_seller_wallet
    from public.profiles where id = v_listing.seller_profile_id;

  if v_buyer_wallet is null or lower(v_buyer_wallet) !~ '^0x[0-9a-f]{40}$' then
    return jsonb_build_object('ok', false, 'error', 'no_buyer_wallet');
  end if;
  if v_seller_wallet is null or lower(v_seller_wallet) !~ '^0x[0-9a-f]{40}$' then
    return jsonb_build_object('ok', false, 'error', 'no_seller_wallet');
  end if;

  -- The copy is still the seller's, and still off chain. Locked FOR UPDATE for
  -- the same reason market_list locks it: a claim being issued right now must
  -- either be visible here or be refused by the trigger below.
  select count(*) into v_copy_ok
    from (
      select id from public.inventory
       where id = v_listing.inventory_id
         and profile_id = v_listing.seller_profile_id
       for update
    ) locked;
  if v_copy_ok <> 1 then
    return jsonb_build_object('ok', false, 'error', 'copy_moved');
  end if;

  select count(*) into v_blocked
    from public.collectible_claims
   where inventory_id = v_listing.inventory_id
     and status = any (array['issued'::text, 'submitted'::text, 'minted'::text]);
  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'carried_on_chain');
  end if;

  v_expires := now() + make_interval(secs => p_ttl_seconds);

  update public.market_listings
     set status = 'reserved',
         buyer_profile_id = p_buyer_profile_id,
         buyer_wallet = lower(v_buyer_wallet),
         seller_wallet = lower(v_seller_wallet),
         pay_chain_id = p_chain_id,
         pay_token = p_pay_token,
         fee_wallet = p_fee_wallet,
         reserved_at = now(),
         reservation_expires_at = v_expires,
         updated_at = now()
   where id = p_listing_id;

  insert into public.market_events (listing_id, profile_id, kind, payload)
  values (
    p_listing_id, p_buyer_profile_id, 'reserved',
    jsonb_build_object(
      'price_minor', v_listing.price_minor,
      'fee_minor', v_listing.fee_minor,
      'seller_minor', v_listing.seller_minor,
      'expires_at', v_expires
    )
  );

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'listing_id', p_listing_id,
    'price_minor', v_listing.price_minor,
    'fee_minor', v_listing.fee_minor,
    'seller_minor', v_listing.seller_minor,
    'seller_wallet', lower(v_seller_wallet),
    'fee_wallet', p_fee_wallet,
    'pay_token', p_pay_token,
    'pay_chain_id', p_chain_id,
    'expires_at', v_expires,
    'seller_paid', false,
    'fee_paid', false
  );
end;
$$;

-- ------------------------------------------------------------------
-- 8. Recording a proven payment, and settling when both legs are in.
-- ------------------------------------------------------------------
--
-- The route has already read the receipt off the chain and proven that this
-- transaction moved the right amount of the right token from the buyer's own
-- wallet to the right payee. What arrives here is that proof, and this function
-- turns it into a settled trade exactly once.
--
-- WHY THE LEGS ARRIVE SEPARATELY. A sale has two payees and a plain ERC-20
-- transfer pays one address, so a buyer ordinarily signs twice. A wallet that
-- batches calls pays both in one transaction, and then both parameters carry
-- the same hash and the trade settles on a single call. Neither shape is
-- special-cased: whatever the route proved is recorded, and the settlement
-- happens the moment both are present.
--
-- IT CANNOT SETTLE TWICE. The settlement is guarded on the status still being
-- 'reserved' under the row lock, so a second call, a retried request or two
-- concurrent tabs all find a settled listing and are answered idempotently
-- rather than moving the card again. A card cannot move twice anyway, because
-- the update that moves it is scoped to the seller still holding it, but "the
-- second attempt does nothing" and "the second attempt is impossible" are two
-- different guarantees and this has both.
--
-- AN EXPIRED RESERVATION DOES NOT STRAND A PAID BUYER. Expiry is not a
-- deadline on settlement, it is a deadline on exclusivity, and it is enforced
-- only where a NEW buyer tries to take the listing. Once a leg has been proven
-- the reservation stops being releasable at all, so a buyer who paid and came
-- back an hour later still completes their trade. A buyer being told their
-- money arrived too late would be the worst sentence in this product.

create or replace function public.market_record_payment(
  p_listing_id uuid,
  p_buyer_profile_id uuid,
  p_seller_tx text,
  p_fee_tx text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.market_listings%rowtype;
  v_copy public.inventory%rowtype;
  v_seller_tx text;
  v_fee_tx text;
  v_before jsonb;
  v_blocked integer;
  v_moved integer;
begin
  if (p_seller_tx is null and p_fee_tx is null) then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_record');
  end if;
  if (p_seller_tx is not null and p_seller_tx !~ '^0x[0-9a-f]{64}$')
     or (p_fee_tx is not null and p_fee_tx !~ '^0x[0-9a-f]{64}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_hash');
  end if;

  select * into v_listing
    from public.market_listings
   where id = p_listing_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_such_listing');
  end if;

  -- Already done. Idempotent for the buyer who did it, refused for anybody
  -- else, because "it settled" and "it settled to you" are different facts.
  if v_listing.status = 'settled' then
    if v_listing.buyer_profile_id = p_buyer_profile_id then
      return jsonb_build_object('ok', true, 'settled', true, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  if v_listing.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'error', 'not_reserved');
  end if;
  if v_listing.buyer_profile_id <> p_buyer_profile_id then
    return jsonb_build_object('ok', false, 'error', 'not_your_reservation');
  end if;

  -- A leg already recorded is not overwritten. The first proof is the real one,
  -- and a second hash for the same leg is either a mistake or an attempt to
  -- attribute somebody else's transaction to this trade.
  v_seller_tx := coalesce(v_listing.seller_tx_hash, p_seller_tx);
  v_fee_tx := coalesce(v_listing.fee_tx_hash, p_fee_tx);

  update public.market_listings
     set seller_tx_hash = v_seller_tx,
         seller_paid_at = case
           when v_seller_tx is null then null
           else coalesce(seller_paid_at, now())
         end,
         fee_tx_hash = v_fee_tx,
         fee_paid_at = case
           when v_fee_tx is null then null
           else coalesce(fee_paid_at, now())
         end,
         updated_at = now()
   where id = p_listing_id;

  insert into public.market_events (listing_id, profile_id, kind, payload)
  values (
    p_listing_id, p_buyer_profile_id, 'paid',
    jsonb_build_object('seller_tx', v_seller_tx, 'fee_tx', v_fee_tx)
  );

  -- Still waiting on the other half. Nothing has moved, and the buyer is told
  -- exactly what remains rather than that something went wrong.
  if v_seller_tx is null or v_fee_tx is null then
    return jsonb_build_object(
      'ok', true,
      'settled', false,
      'seller_paid', v_seller_tx is not null,
      'fee_paid', v_fee_tx is not null
    );
  end if;

  -- Both legs proven. Everything below is the settlement, and it is one
  -- transaction with the payment record above.

  -- The copy, re-checked under the lock and photographed before it moves. Both
  -- of these refusals are unreachable while the two triggers below exist, since
  -- a live listing blocks both the burn and the claim, and both are checked
  -- anyway: they are the last thing standing between a paid buyer and nothing.
  select * into v_copy
    from public.inventory
   where id = v_listing.inventory_id
     and profile_id = v_listing.seller_profile_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'copy_moved');
  end if;

  v_before := jsonb_build_object(
    'id', v_copy.id,
    'profile_id', v_copy.profile_id,
    'set_slug', v_copy.set_slug,
    'card_number', v_copy.card_number,
    'champion_slug', v_copy.champion_slug,
    'rarity', v_copy.rarity,
    'source', v_copy.source,
    'source_id', v_copy.source_id,
    'acquired_at', v_copy.acquired_at
  );

  select count(*) into v_blocked
    from public.collectible_claims
   where inventory_id = v_listing.inventory_id
     and status = any (array['issued'::text, 'submitted'::text, 'minted'::text]);
  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'carried_on_chain');
  end if;

  -- The card moves, straight from the seller to the buyer. This is the only
  -- statement in the whole market that changes who owns a card, and there is
  -- no instant at which the answer is the platform. Scoped to the seller still
  -- holding it, so the move can never happen twice.
  --
  -- The source becomes 'market' and acquired_at becomes now, because for the
  -- buyer both are true: they did not open this out of a chest, and they have
  -- held it since this moment. The row's previous life is in v_before, written
  -- into the settlement event below, which is the only place it survives.
  update public.inventory
     set profile_id = v_listing.buyer_profile_id,
         source = 'market',
         source_id = p_listing_id,
         acquired_at = now()
   where id = v_listing.inventory_id
     and profile_id = v_listing.seller_profile_id;

  get diagnostics v_moved = row_count;
  if v_moved <> 1 then
    return jsonb_build_object('ok', false, 'error', 'copy_moved');
  end if;

  update public.market_listings
     set status = 'settled',
         settled_at = now(),
         updated_at = now()
   where id = p_listing_id
     and status = 'reserved';

  get diagnostics v_moved = row_count;
  if v_moved <> 1 then
    -- Unreachable under the row lock taken at the top, and refused rather than
    -- assumed: a settlement that wrote a card move without closing its listing
    -- would leave the card sellable again by somebody who no longer owns it.
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  insert into public.market_events (listing_id, profile_id, kind, payload)
  values (
    p_listing_id, p_buyer_profile_id, 'settled',
    jsonb_build_object(
      'seller_profile_id', v_listing.seller_profile_id,
      'buyer_profile_id', p_buyer_profile_id,
      'price_minor', v_listing.price_minor,
      'fee_minor', v_listing.fee_minor,
      'seller_minor', v_listing.seller_minor,
      'seller_wallet', v_listing.seller_wallet,
      'fee_wallet', v_listing.fee_wallet,
      'pay_token', v_listing.pay_token,
      'pay_chain_id', v_listing.pay_chain_id,
      'seller_tx', v_seller_tx,
      'fee_tx', v_fee_tx,
      -- The copy exactly as it was before the sale. The only record of where
      -- this card came from before it changed hands.
      'copy_before', v_before
    )
  );

  return jsonb_build_object(
    'ok', true,
    'settled', true,
    'already', false,
    'inventory_id', v_listing.inventory_id
  );
end;
$$;

-- ------------------------------------------------------------------
-- 9. The two rules a route would have forgotten.
-- ------------------------------------------------------------------
--
-- A card on the board must not be destroyed or carried on-chain underneath the
-- listing. Both of these are enforceable in a route, and both would eventually
-- be missed by one, so they are enforced at the table instead. Neither trigger
-- takes a lock the other side does not already hold, so neither can deadlock
-- against the market's own functions: every path that touches a listed copy
-- takes the inventory row's lock first and the listing's state second.

-- 9a. A listed card cannot be burned.
--
-- public.craft_cards deletes rows from public.inventory. Deleting a copy that
-- is on the board, or worse, one a buyer has already paid for, would leave the
-- market selling a card that no longer exists. The craft holds FOR UPDATE on
-- the row before it deletes, and market_list holds the same lock before it
-- writes a listing, so the two serialise and whichever commits second sees the
-- other. This catches the second one.
create or replace function public.market_block_listed_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live integer;
begin
  select count(*) into v_live
    from public.market_listings
   where inventory_id = old.id
     and status = any (array['active'::text, 'reserved'::text]);
  if v_live > 0 then
    -- A custom SQLSTATE rather than a generic one, so the craft route can turn
    -- this into a sentence a member understands instead of reporting the realm
    -- as unavailable for something that is entirely their own doing.
    raise exception 'That card is listed on the Bazaar'
      using errcode = 'RS001';
  end if;
  return old;
end;
$$;

drop trigger if exists market_block_listed_delete on public.inventory;
create trigger market_block_listed_delete
  before delete on public.inventory
  for each row execute function public.market_block_listed_delete();

-- 9b. A listed card cannot be claimed on-chain.
--
-- This is the one that actually protects a buyer's money. Without it a seller
-- could list a card, wait for somebody to pay, and mint the token to their own
-- wallet before the settlement lands; the buyer would receive a ledger row for
-- a token the seller holds, and the chain would be right.
--
-- The FOR UPDATE inside this trigger is what makes it race-proof rather than
-- merely usually right. Taking the inventory row's lock before reading the
-- listing table forces this insert and market_list or market_reserve into a
-- strict order: whichever takes the lock first commits first, and the other
-- sees the committed result and refuses. A plain SELECT here would be an
-- MVCC snapshot taken beside an uncommitted listing, which reads as no listing
-- at all.
create or replace function public.market_block_listed_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live integer;
begin
  -- Crest claims name no copy and can never collide with a listing, since a
  -- crest is soulbound and is not listable in the first place.
  if new.inventory_id is null then
    return new;
  end if;

  perform 1 from public.inventory where id = new.inventory_id for update;

  select count(*) into v_live
    from public.market_listings
   where inventory_id = new.inventory_id
     and status = any (array['active'::text, 'reserved'::text]);
  if v_live > 0 then
    raise exception 'That card is listed on the Bazaar'
      using errcode = 'RS002';
  end if;
  return new;
end;
$$;

drop trigger if exists market_block_listed_claim on public.collectible_claims;
create trigger market_block_listed_claim
  before insert on public.collectible_claims
  for each row execute function public.market_block_listed_claim();

-- ------------------------------------------------------------------
-- 10. EXECUTE to service_role ONLY.
-- ------------------------------------------------------------------
--
-- Supabase publishes every public function at /rest/v1/rpc/<name> and the anon
-- key ships in the browser bundle, so a public grant on any of these would let
-- anyone in the world settle a listing without paying for it, cancel somebody
-- else's sale, or reserve every card on the board. These functions move
-- property between members on the strength of a payment proven elsewhere, which
-- makes them the most dangerous entry points in the realm after
-- public.craft_cards. See 20260811090000_revoke_public_execute_on_economy_rpcs.sql
-- for the incident the rule comes from.

revoke all on function public.market_list(uuid, uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.market_list(uuid, uuid, integer, integer, integer, integer)
  to service_role;

revoke all on function public.market_cancel(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.market_cancel(uuid, uuid)
  to service_role;

revoke all on function public.market_reserve(uuid, uuid, integer, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.market_reserve(uuid, uuid, integer, text, text, integer)
  to service_role;

revoke all on function public.market_record_payment(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.market_record_payment(uuid, uuid, text, text)
  to service_role;

-- The two trigger functions are called by the database itself, never over the
-- wire, so nobody needs EXECUTE on them at all.
revoke all on function public.market_block_listed_delete() from public, anon, authenticated;
revoke all on function public.market_block_listed_claim() from public, anon, authenticated;
