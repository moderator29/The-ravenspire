-- The Bazaar, part 1 of 4: the flag, the tables, the indexes and the RLS posture
--
-- SPLIT TO MATCH THE MIGRATION LEDGER. This was authored as one file,
-- 20260816090000_the_bazaar.sql, and applied in four parts because the whole
-- was too large to move in a single call. The repository now carries the same
-- four parts under the same four names and version numbers the live project
-- recorded, so `list_migrations` against production and `ls` in this directory
-- read the same. That matters more than tidiness here: four of the divergences
-- this project has had to recover from began with a migration whose file and
-- whose applied version did not line up, and the most recent one nearly
-- dropped the 'war' ledger category and broke every War award in the realm.
--
-- Apply these in version order. Part 1 creates what parts 2 to 4 reference.

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
