-- The Collectibles Realm, Phase D: the commerce engine.
-- Additive; everything stays sealed behind the realm flags until launch.
--
-- RECOVERED FILE. This migration was applied to the live project
-- (tqvigouaifbklvajiyoj, version 20260812224950) by an earlier session whose
-- branch never reached main, so the database carried tables that the
-- repository had no record of: payments, payment_events, fulfillments,
-- chest_entitlements, inventory, and the columns added to orders, order_items,
-- chest_openings and redemptions. The text below is the applied statement,
-- read back out of supabase_migrations.schema_migrations and committed
-- verbatim so the two agree again.
--
-- A schema that exists only in production is a schema nobody can review, test
-- against, or rebuild. This file is what makes the next migration safe to
-- write, and it is why the one after it (the ownership loop) builds on the
-- inventory shape below rather than the one the plan document imagined.

-- 1. Orders and order items: minor units, currency, idempotency, provider.
alter table public.orders
  add column if not exists total_minor integer,
  add column if not exists currency text not null default 'usd',
  add column if not exists idempotency_key text,
  add column if not exists provider text,
  add column if not exists provider_session_id text,
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_total_minor_check;
alter table public.orders
  add constraint orders_total_minor_check
  check (total_minor is null or total_minor >= 0);

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

-- 2. Payments: one row per provider payment attempt, verified from a webhook.
create table if not exists public.payments (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  provider text not null,
  provider_ref text,
  status text not null default 'pending'::text,
  amount_minor integer,
  currency text not null default 'usd'::text,
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

-- 3. Webhook idempotency: a provider event is processed at most once.
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

-- 4. Fulfillments: one row per physical order sent to a print vendor.
create table if not exists public.fulfillments (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  vendor text not null,
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

-- 5. Chest entitlements: the unopened-chest ledger.
create table if not exists public.chest_entitlements (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  chest_sku text not null,
  source_kind text not null,
  source_id uuid,
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

create index if not exists chest_entitlements_open_idx
  on public.chest_entitlements (profile_id, chest_sku)
  where opened_at is null;

-- 6. Chest openings: reveal the seeds so every pull is verifiable.
alter table public.chest_openings
  add column if not exists server_seed text,
  add column if not exists client_seed text,
  add column if not exists nonce integer;

-- 7. Inventory: the holdings ledger, written by opening and redemption.
create table if not exists public.inventory (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  set_slug text not null,
  card_number integer not null,
  champion_slug text not null,
  rarity text not null,
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

-- 8. Redemptions: track attempts and the chest sku the code grants.
alter table public.redemptions
  add column if not exists chest_sku text,
  add column if not exists attempts integer not null default 0;

alter table public.redemptions
  drop constraint if exists redemptions_attempts_check;
alter table public.redemptions
  add constraint redemptions_attempts_check check (attempts >= 0);

-- 9. Seed the chest tiers, so entitlement and opening foreign keys resolve.
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

-- 10. RLS: every new table sealed. Service role only.
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
