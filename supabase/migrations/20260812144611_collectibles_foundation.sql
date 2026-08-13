-- The Collectibles Realm, Phase A: the foundation (V2 Part Two, sections 27, 28.1).
--
-- WHY
-- The founder's build order for the collectibles pivot is backend live,
-- frontend sealed: the real tables and the real interest capture exist now, so
-- that opening day is a flag flip and not a deploy. Everything here is
-- additive. No existing table or route changes shape, and nothing reads from
-- the catalog tables until the Reliquary preview (Phase B) asks for them.
--
-- Three groups:
--   1. realm_flags: the launch switches (reliquary_live, chests_live,
--      mercer_live). World-readable, service-role writable.
--   2. interest: the waitlist. "Notify me" buttons that actually register
--      something, replacing the /soon buttons that navigated to /ravens and
--      recorded nothing. Interest counts are real demand data for the launch
--      decision.
--   3. The catalog: collectible_sets, collectibles, chests, chest_openings,
--      merch_products, redemptions, orders, order_items. Schema now, endpoints
--      later. The inventory table from section 28.1 is deliberately absent: it
--      is the server-authoritative holdings ledger and it lands with the chest
--      opening flow that writes it, so a ledger never exists before the only
--      thing allowed to write to it.
--
-- RLS
-- Deny by default to every browser role, the same posture as public.mutes,
-- public.notifications and public.raven_conversations, and for the same
-- architectural reason: this stack authenticates with Privy, so auth.uid() is
-- always null and an owner policy written against it would match nothing and
-- protect nothing. Ownership is enforced in the routes, which resolve the
-- member from a verified Privy token and read and write with the service role.
-- The one exception is realm_flags, which is honestly public: whether a
-- chapter is sealed is not a secret, and the padlock UI is driven by it.
-- Catalog read policies arrive in Phase B alongside the surfaces that need
-- them; granting them now would be granting reads nothing performs.

-- ------------------------------------------------------------------
-- 1. The launch switches.
-- ------------------------------------------------------------------

create table if not exists public.realm_flags (
  key text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint realm_flags_pkey primary key (key),
  constraint realm_flags_key_check check (key <> ''::text)
);

-- The three chapters this phase seals. Idempotent, and never re-seals a flag
-- an operator has since flipped: on conflict the row is left exactly as it is.
insert into public.realm_flags (key, enabled)
values
  ('reliquary_live', false),
  ('chests_live', false),
  ('mercer_live', false)
on conflict (key) do nothing;

alter table public.realm_flags enable row level security;

-- Readable by everyone. Writable by nobody except the service role: no
-- insert, update or delete policy exists, so RLS default-denies them all.
drop policy if exists "realm flags public read" on public.realm_flags;
create policy "realm flags public read"
  on public.realm_flags for select
  to public
  using (true);

revoke all on public.realm_flags from anon, authenticated;
grant select on public.realm_flags to anon, authenticated;

-- ------------------------------------------------------------------
-- 2. The waitlist.
-- ------------------------------------------------------------------

create table if not exists public.interest (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  feature text not null,
  created_at timestamptz not null default now(),
  constraint interest_pkey primary key (id),
  constraint interest_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  -- The route validates against an explicit allowlist; this bounds whatever
  -- reaches the table anyway. A feature key is a short slug, never prose.
  constraint interest_feature_check
    check (feature <> ''::text and char_length(feature) <= 40),
  -- Registering twice is one registration. The route treats the duplicate as
  -- success, so the unique pair is what makes "Notify me" idempotent.
  constraint interest_profile_feature_key unique (profile_id, feature)
);

-- The launch decision reads counts per feature.
create index if not exists interest_feature_idx
  on public.interest (feature);

alter table public.interest enable row level security;

-- Deny by default, made explicit. Insert and select of a member's own rows
-- happen in /api/interest under the service role after Privy verification;
-- an auth.uid() owner policy here would match nothing (see the header).
-- There is no update in the product (a registration has nothing to edit) and
-- no delete yet (unsubscribing is a notify-preferences decision for Phase B).
drop policy if exists "interest owner only" on public.interest;
create policy "interest owner only"
  on public.interest for select using (false);

revoke all on public.interest from anon, authenticated;

-- ------------------------------------------------------------------
-- 3. The catalog. Service-role only until Phase B.
-- ------------------------------------------------------------------

create table if not exists public.collectible_sets (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  -- The season the set belongs to, when it belongs to one. Set One does.
  season_id integer,
  status text not null default 'preview'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collectible_sets_pkey primary key (id),
  constraint collectible_sets_slug_key unique (slug),
  constraint collectible_sets_slug_check check (slug <> ''::text),
  constraint collectible_sets_name_check check (name <> ''::text),
  constraint collectible_sets_season_id_fkey
    foreign key (season_id) references public.seasons (id) on delete set null,
  constraint collectible_sets_status_check
    check (status = any (array['preview'::text, 'live'::text, 'closed'::text]))
);

create table if not exists public.collectibles (
  id uuid not null default gen_random_uuid(),
  set_id uuid not null,
  -- The champion this card is, for kind 'card'. The champion roster lives in
  -- lib/game/champions.ts (the single source of truth), not in a table, so
  -- this is a slug and not a foreign key. Null for relics.
  champion_slug text,
  kind text not null default 'card'::text,
  rarity text not null,
  house_slug text,
  art_url text,
  metadata jsonb not null default '{}'::jsonb,
  -- Frozen before anything mints (section 28.3). Null while undecided.
  planned_supply integer,
  -- The on-chain identity, all null until the mint phase. Nothing on-chain is
  -- retractable, so on-chain goes last.
  chain text,
  contract text,
  token_id text,
  status text not null default 'preview'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collectibles_pkey primary key (id),
  constraint collectibles_set_id_fkey
    foreign key (set_id) references public.collectible_sets (id) on delete cascade,
  constraint collectibles_house_slug_fkey
    foreign key (house_slug) references public.houses (slug) on delete set null,
  constraint collectibles_kind_check
    check (kind = any (array['card'::text, 'relic'::text])),
  -- The live rarity ladder, exactly as the War already names it.
  constraint collectibles_rarity_check
    check (rarity = any (array['rare'::text, 'epic'::text, 'legendary'::text, 'mythic'::text])),
  -- The section 28.3 sequence: preview (off-chain catalog), claimable
  -- (contracts deployed, vouchers live), tradable.
  constraint collectibles_status_check
    check (status = any (array['preview'::text, 'claimable'::text, 'tradable'::text])),
  constraint collectibles_planned_supply_check
    check (planned_supply is null or planned_supply > 0)
);

-- One card per champion per set. Partial, because relics carry no champion.
create unique index if not exists collectibles_set_champion_idx
  on public.collectibles (set_id, champion_slug)
  where champion_slug is not null;

-- The Reliquary browses a set by rarity.
create index if not exists collectibles_set_rarity_idx
  on public.collectibles (set_id, rarity);

create table if not exists public.chests (
  sku text not null,
  name text not null,
  -- Tier names await a founder vote (section 33), so this is bounded but not
  -- enumerated. It becomes a check constraint when the names are law.
  tier text not null,
  -- Printed on the box, exact and honest, before any purchase exists.
  odds jsonb not null default '{}'::jsonb,
  includes_merch boolean not null default false,
  -- Null until pricing is decided. Never invented.
  price_usd numeric(10, 2),
  status text not null default 'preview'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chests_pkey primary key (sku),
  constraint chests_sku_check check (sku <> ''::text),
  constraint chests_name_check check (name <> ''::text),
  constraint chests_tier_check
    check (tier <> ''::text and char_length(tier) <= 40),
  constraint chests_price_usd_check
    check (price_usd is null or price_usd >= 0),
  constraint chests_status_check
    check (status = any (array['preview'::text, 'live'::text, 'retired'::text]))
);

create table if not exists public.chest_openings (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  chest_sku text not null,
  -- What came out, settled server-side against the printed odds, same law as
  -- Glory: the client is told, never asked.
  result jsonb not null default '{}'::jsonb,
  -- Committed before the pull, revealed after, so every opening is auditable.
  server_seed_hash text not null,
  opened_at timestamptz not null default now(),
  constraint chest_openings_pkey primary key (id),
  constraint chest_openings_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint chest_openings_chest_sku_fkey
    foreign key (chest_sku) references public.chests (sku),
  constraint chest_openings_seed_check check (server_seed_hash <> ''::text)
);

-- A member's pull history, newest first.
create index if not exists chest_openings_profile_opened_idx
  on public.chest_openings (profile_id, opened_at desc);

create table if not exists public.merch_products (
  sku text not null,
  name text not null,
  -- tee, hoodie, cap, print, playmat at launch; the catalog is a founder
  -- decision, so bounded rather than enumerated, same reasoning as chest tier.
  kind text not null,
  -- Real photos or nothing. Until product photos exist this stays empty and
  -- the Mercer renders silhouettes; no fake product photos, ever.
  images jsonb not null default '[]'::jsonb,
  sizes jsonb not null default '[]'::jsonb,
  status text not null default 'preview'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merch_products_pkey primary key (sku),
  constraint merch_products_sku_check check (sku <> ''::text),
  constraint merch_products_name_check check (name <> ''::text),
  constraint merch_products_kind_check
    check (kind <> ''::text and char_length(kind) <= 40),
  constraint merch_products_status_check
    check (status = any (array['preview'::text, 'live'::text, 'retired'::text]))
);

-- The physical-to-digital bridge: a printed code in a physical Warchest that
-- mints the digital twin to the buyer's own wallet. Codes are stored hashed,
-- single use.
create table if not exists public.redemptions (
  id uuid not null default gen_random_uuid(),
  code_hash text not null,
  -- What redeeming grants: collectible ids and quantities. Interpreted by the
  -- redeem endpoint (mint phase), never by the client.
  grants jsonb not null default '{}'::jsonb,
  redeemed_by uuid,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint redemptions_pkey primary key (id),
  constraint redemptions_code_hash_key unique (code_hash),
  constraint redemptions_code_hash_check check (code_hash <> ''::text),
  constraint redemptions_redeemed_by_fkey
    foreign key (redeemed_by) references public.profiles (id) on delete set null,
  -- A redemption is either whole or untouched: who and when arrive together.
  constraint redemptions_redeemed_pair_check
    check ((redeemed_by is null) = (redeemed_at is null))
);

-- Orders exist as schema only until the payments phase (section 33, Phase D).
-- No endpoint writes them yet.
create table if not exists public.orders (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  status text not null default 'pending'::text,
  total_usd numeric(10, 2),
  shipping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_pkey primary key (id),
  constraint orders_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint orders_status_check
    check (status = any (array[
      'pending'::text,
      'paid'::text,
      'fulfilled'::text,
      'cancelled'::text,
      'refunded'::text
    ])),
  constraint orders_total_usd_check
    check (total_usd is null or total_usd >= 0)
);

create index if not exists orders_profile_created_idx
  on public.orders (profile_id, created_at desc);

create table if not exists public.order_items (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  -- What the line is: a chest sku or a merch sku. The sku is text against the
  -- owning table's namespace rather than a two-way nullable foreign key pair,
  -- which would let a row point at both or neither.
  kind text not null,
  sku text not null,
  qty integer not null default 1,
  unit_price_usd numeric(10, 2),
  constraint order_items_pkey primary key (id),
  constraint order_items_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade,
  constraint order_items_kind_check
    check (kind = any (array['chest'::text, 'merch'::text])),
  constraint order_items_sku_check check (sku <> ''::text),
  constraint order_items_qty_check check (qty > 0),
  constraint order_items_unit_price_check
    check (unit_price_usd is null or unit_price_usd >= 0)
);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

-- ------------------------------------------------------------------
-- 4. Catalog RLS: everything sealed.
-- ------------------------------------------------------------------
--
-- RLS on, no policies, grants revoked: the browser roles can do nothing at
-- all. Every read and write goes through server routes holding the
-- service-role key. Catalog select policies (sets, collectibles, chests,
-- merch) arrive with the Phase B preview surfaces that perform those reads.

alter table public.collectible_sets enable row level security;
alter table public.collectibles enable row level security;
alter table public.chests enable row level security;
alter table public.chest_openings enable row level security;
alter table public.merch_products enable row level security;
alter table public.redemptions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.collectible_sets from anon, authenticated;
revoke all on public.collectibles from anon, authenticated;
revoke all on public.chests from anon, authenticated;
revoke all on public.chest_openings from anon, authenticated;
revoke all on public.merch_products from anon, authenticated;
revoke all on public.redemptions from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
