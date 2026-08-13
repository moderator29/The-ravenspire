-- The Collectibles Realm, Phase D: the commerce engine (V2 Part Two, section
-- 33, item 7). Additive throughout, and everything stays sealed behind the
-- realm flags until launch, the same "backend live, frontend sealed" posture as
-- the foundation migration.
--
-- FILENAME RECONCILED. This was authored as 20260812130000 but applied to the
-- live project (tqvigouaifbklvajiyoj) as version 20260812224950, so the
-- repository and the database disagreed about whether it had run: the CLI would
-- have seen an unapplied migration and tried to apply it again. The SQL is
-- byte-identical either way and every statement in it is idempotent, so nothing
-- was at risk, but a migration ledger that lies is a bad thing to leave lying
-- around. Renamed to the version that actually ran.
--
-- WHY THIS EXISTS
-- The foundation migration (20260812120000) laid schema-only orders,
-- order_items, chests, chest_openings, redemptions and merch_products, with no
-- endpoint writing them. This migration is where the money and the mechanism
-- land: integer minor-unit amounts, provider-verified payments, provably-fair
-- chest opening, non-custodial redemption, and physical fulfillment.
--
-- MONEY IS AN INTEGER
-- Every amount here is an integer count of the currency's minor unit (cents),
-- never a float. The foundation migration modelled totals as numeric(10,2),
-- which is decimal-exact but invites float arithmetic in application code; the
-- minor-unit integer columns added here are the ones the commerce routes read
-- and write. The numeric columns are left in place, additive, unused by the new
-- code, so nothing that read them breaks.
--
-- RLS
-- Deny by default to every browser role, identical to the foundation tables and
-- for the same reason: this stack authenticates with Privy, so auth.uid() is
-- always null and an owner policy would protect nothing. Ownership is enforced
-- in the routes, which resolve the member from a verified Privy token and read
-- and write with the service role. Every new table gets RLS on, grants revoked,
-- and no policy.

-- ------------------------------------------------------------------
-- 1. Orders and order items: minor units, currency, idempotency, provider.
-- ------------------------------------------------------------------

alter table public.orders
  add column if not exists total_minor integer,
  add column if not exists currency text not null default 'usd',
  add column if not exists idempotency_key text,
  add column if not exists provider text,
  add column if not exists provider_session_id text,
  add column if not exists paid_at timestamptz;

-- An amount is a non-negative integer number of cents, or absent while the
-- order is still being priced.
alter table public.orders
  drop constraint if exists orders_total_minor_check;
alter table public.orders
  add constraint orders_total_minor_check
  check (total_minor is null or total_minor >= 0);

-- Idempotency for order creation: the same key from the same member never
-- creates a second order, so a retried "buy" is one order and one charge.
-- Scoped to the member so one member's key can never collide with another's.
create unique index if not exists orders_profile_idempotency_idx
  on public.orders (profile_id, idempotency_key)
  where idempotency_key is not null;

alter table public.order_items
  add column if not exists unit_price_minor integer;

alter table public.order_items
  drop constraint if exists order_items_unit_price_minor_check;
alter table public.order_items
  add constraint order_items_unit_price_minor_check
  check (unit_price_minor is null or unit_price_minor >= 0);

-- ------------------------------------------------------------------
-- 2. Payments: one row per provider payment attempt, verified from a webhook.
-- ------------------------------------------------------------------

create table if not exists public.payments (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  provider text not null,
  -- The provider's own session or payment reference.
  provider_ref text,
  status text not null default 'pending'::text,
  amount_minor integer,
  currency text not null default 'usd'::text,
  -- The verified event payload, for audit. Never trusted for authorization;
  -- the route acts on the parsed, verified fields only.
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_pkey primary key (id),
  constraint payments_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade,
  constraint payments_provider_check check (provider <> ''::text),
  constraint payments_status_check
    check (status = any (array['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text])),
  constraint payments_amount_check
    check (amount_minor is null or amount_minor >= 0)
);

create index if not exists payments_order_idx on public.payments (order_id);

-- ------------------------------------------------------------------
-- 3. Webhook idempotency: a provider event is processed at most once.
-- ------------------------------------------------------------------
--
-- The provider event id is the primary key, so a redelivered webhook (which
-- every provider does) inserts once and the second insert conflicts. The route
-- treats the conflict as "already handled" and does no work, so an event can
-- never credit an order twice.

create table if not exists public.payment_events (
  event_id text not null,
  provider text not null,
  order_id uuid,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint payment_events_pkey primary key (event_id),
  constraint payment_events_provider_check check (provider <> ''::text),
  constraint payment_events_kind_check check (kind <> ''::text)
);

-- ------------------------------------------------------------------
-- 4. Fulfillments: one row per physical order sent to a print vendor.
-- ------------------------------------------------------------------

create table if not exists public.fulfillments (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  vendor text not null,
  -- The vendor's own order id, for reconciliation.
  vendor_ref text,
  status text not null default 'pending'::text,
  shipping jsonb not null default '{}'::jsonb,
  tracking jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fulfillments_pkey primary key (id),
  constraint fulfillments_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade,
  constraint fulfillments_vendor_check
    check (vendor <> ''::text and char_length(vendor) <= 40),
  constraint fulfillments_status_check
    check (status <> ''::text and char_length(status) <= 40)
);

create index if not exists fulfillments_order_idx on public.fulfillments (order_id);

-- ------------------------------------------------------------------
-- 5. Chest entitlements: the unopened-chest ledger.
-- ------------------------------------------------------------------
--
-- A paid digital chest, or a redeemed physical one, grants the member the right
-- to open one chest. That right is a row here, consumed by the opening flow. It
-- is a separate ledger from chest_openings (the audit of what came out) because
-- the two answer different questions: what a member may still open, and what a
-- member has already opened. Opening is a single conditional update that sets
-- opened_at only while it is null, so two concurrent opens of the same
-- entitlement cannot both succeed: the second update matches no row.

create table if not exists public.chest_entitlements (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  chest_sku text not null,
  -- Where the entitlement came from: a paid order or a redeemed code.
  source_kind text not null,
  source_id uuid,
  -- Set once, on open. Null means unopened. Its presence is what prevents a
  -- double open.
  opened_at timestamptz,
  opening_id uuid,
  created_at timestamptz not null default now(),
  constraint chest_entitlements_pkey primary key (id),
  constraint chest_entitlements_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint chest_entitlements_chest_sku_fkey
    foreign key (chest_sku) references public.chests (sku),
  constraint chest_entitlements_source_kind_check
    check (source_kind = any (array['order'::text, 'redemption'::text])),
  constraint chest_entitlements_opening_id_fkey
    foreign key (opening_id) references public.chest_openings (id) on delete set null
);

-- The hot lookup: a member's next unopened chest of a given sku.
create index if not exists chest_entitlements_open_idx
  on public.chest_entitlements (profile_id, chest_sku)
  where opened_at is null;

-- ------------------------------------------------------------------
-- 6. Chest openings: reveal the seeds so every pull is verifiable.
-- ------------------------------------------------------------------
--
-- The foundation table stored only the committed hash. These columns hold the
-- revealed seeds and the nonce, so a member can replay the pull and confirm the
-- server did not cheat. They are written after the pull, on reveal.

alter table public.chest_openings
  add column if not exists server_seed text,
  add column if not exists client_seed text,
  add column if not exists nonce integer;

-- ------------------------------------------------------------------
-- 7. Inventory: the holdings ledger, written by opening and redemption.
-- ------------------------------------------------------------------
--
-- The foundation migration deliberately omitted this table so a ledger never
-- existed before the only thing allowed to write it. That thing lands now.
-- Card identity is denormalised from the code catalog (lib/collectibles), which
-- is the single source of truth for Set One, rather than a foreign key into a
-- collectibles table that is not yet seeded. Every value here is real: a card a
-- member actually pulled or redeemed.

create table if not exists public.inventory (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  set_slug text not null,
  -- The collector number, 1 through 40 for Set One.
  card_number integer not null,
  champion_slug text not null,
  rarity text not null,
  -- How it was acquired and the audit row it came from.
  source text not null,
  source_id uuid,
  acquired_at timestamptz not null default now(),
  constraint inventory_pkey primary key (id),
  constraint inventory_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint inventory_set_slug_check check (set_slug <> ''::text),
  constraint inventory_champion_slug_check check (champion_slug <> ''::text),
  constraint inventory_card_number_check check (card_number > 0),
  constraint inventory_rarity_check
    check (rarity = any (array['rare'::text, 'epic'::text, 'legendary'::text, 'mythic'::text])),
  constraint inventory_source_check
    check (source = any (array['chest_opening'::text, 'redemption'::text]))
);

create index if not exists inventory_profile_idx
  on public.inventory (profile_id, acquired_at desc);

-- ------------------------------------------------------------------
-- 8. Redemptions: track attempts and the chest sku the code grants.
-- ------------------------------------------------------------------

alter table public.redemptions
  add column if not exists chest_sku text,
  add column if not exists attempts integer not null default 0;

alter table public.redemptions
  drop constraint if exists redemptions_attempts_check;
alter table public.redemptions
  add constraint redemptions_attempts_check check (attempts >= 0);

-- ------------------------------------------------------------------
-- 9. Seed the chest tiers, so the entitlement and opening foreign keys
--    resolve when the flag is flipped.
-- ------------------------------------------------------------------
--
-- Real data only: the tier names are confirmed (item 7) and the odds are the
-- exact printed odds from lib/collectibles/warchests.ts, validated to sum to
-- 100 at module load. price_usd stays null, because pricing is not confirmed
-- and a provisional price never appears on a customer surface; the checkout
-- route reads price from the server catalog (lib/commerce/catalog.ts), not this
-- column. Idempotent: an operator who has since edited a row keeps their edit.

insert into public.chests (sku, name, tier, odds, includes_merch, status)
values
  (
    'squires-chest', 'Squire''s Chest', 'squire',
    '{"rare":74,"epic":20,"legendary":5.4,"mythic":0.6}'::jsonb,
    false, 'preview'
  ),
  (
    'knights-warchest', 'Knight''s Warchest', 'knight',
    '{"rare":55,"epic":30,"legendary":13,"mythic":2}'::jsonb,
    false, 'preview'
  ),
  (
    'kings-reliquary', 'King''s Reliquary', 'king',
    '{"rare":45,"epic":33,"legendary":19,"mythic":3}'::jsonb,
    true, 'preview'
  )
on conflict (sku) do nothing;

-- ------------------------------------------------------------------
-- 10. RLS: every new table sealed. Service role only.
-- ------------------------------------------------------------------

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.fulfillments enable row level security;
alter table public.chest_entitlements enable row level security;
alter table public.inventory enable row level security;

revoke all on public.payments from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
revoke all on public.fulfillments from anon, authenticated;
revoke all on public.chest_entitlements from anon, authenticated;
revoke all on public.inventory from anon, authenticated;
