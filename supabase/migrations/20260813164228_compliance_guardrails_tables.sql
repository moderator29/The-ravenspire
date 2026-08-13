-- COMPLIANCE GUARDRAILS, before commerce takes a dollar (mission 12).
--
-- WHY THIS EXISTS
-- Two of section 34's four answers to the gambling optics of a mystery box are
-- already built and enforced at module load: exact printed odds, validated to
-- sum to 100 in lib/collectibles/warchests.ts, and a guaranteed floor per box,
-- validated against the dealt worst case in lib/commerce/catalog.ts. The rest
-- of the posture was prose. This migration is the rest of the posture, and it
-- lands before COMMERCE_PRICES_CONFIRMED can honestly be turned on.
--
-- Five guardrails, all server enforced:
--   1. THE ALMS, a free method of entry granting a real chest.
--   2. AN AGE GATE, recorded here, gating the paid paths only.
--   3. SPEND CAPS over two rolling windows, computed from real order history.
--   4. COOLING OFF: a velocity brake, an informed consent interruption, and a
--      member set cap that lowers at once and raises only after a day.
--   5. GEO, decided in lib/commerce/geo.ts and recorded here.
--
-- NOBODY WHO WROTE THIS IS A LAWYER, and it claims compliance with no law. It
-- states what the realm enforces. lib/commerce/compliance.ts carries a "what
-- this does not cover" paragraph per guardrail, written so a real adviser can
-- read it and say what is missing.
--
-- WHY THE DECISIONS ARE HERE AND THE NUMBERS ARE NOT
-- A spend cap that is read in one round trip and written in the next is not a
-- cap. Ten concurrent checkouts each read a spend of zero and all ten pass. So
-- the check and the order insert have to be one transaction under one lock, and
-- only the database can do that. Same division of labour as public.chest_open
-- and public.craft_cards.
--
-- But every threshold below is a REQUIRED PARAMETER with no default, and that
-- is deliberate. A default here would be a second copy of a number that also
-- lives in lib/commerce/compliance.ts, and two copies of a threshold drift the
-- first time somebody tunes one of them, silently, in the direction of taking
-- more money. A required parameter cannot drift because it cannot exist in two
-- places. If a caller forgets one, the call fails loudly rather than enforcing
-- a number nobody chose.
--
-- READ BEFORE ALTERING, per supabase/migrations/README.md. One existing object
-- is altered here: chest_entitlements_source_kind_check. Its live definition was
-- read out of the database before this was written:
--
--   CHECK ((source_kind = ANY (ARRAY['order'::text, 'redemption'::text])))
--
-- which matches 20260812224950_commerce_engine.sql exactly. Repository and
-- database agree. The alteration adds 'amoe' and drops nothing. Checked, not
-- assumed.
--
-- RLS, per the standing posture: this stack authenticates with Privy, so
-- auth.uid() is always null and an owner policy would protect nothing. Both new
-- tables are deny by default with grants revoked and no policy, and ownership is
-- enforced in the routes under the service role. Every function is revoked from
-- public, anon and authenticated and granted to service_role alone, because
-- Supabase publishes every public function at /rest/v1/rpc/<name> and the anon
-- key ships in the browser bundle.
--
-- APPLIED IN FOUR PARTS, and the four files carry the names and versions
-- production recorded so the two listings read the same. See
-- supabase/migrations/README.md: filenames cannot match applied versions,
-- because a migration applied through the Supabase API is stamped server side
-- at apply time. What matters is that every applied version has a file here and
-- that the file's content is what ran.
--
--   20260813164228  compliance_guardrails_tables
--   20260813164320  compliance_guardrails_checkout_guard
--   20260813164348  compliance_guardrails_member_state
--   20260813164429  compliance_guardrails_alms_and_grants
--
-- Part 1 of 4: the two tables, the geo columns on orders, the Alms source kind, and deny by default on both new tables.

-- ============================================================
-- 1. Where a member's compliance state lives, and why not on profiles
-- ============================================================
--
-- A separate table rather than four more columns on profiles, and the reason is
-- not tidiness. public.profiles carries COLUMN LEVEL GRANTS to anon: the
-- browser role holds SELECT on handle, display_name, bio, glory, house_slug and
-- a dozen more, because the profile is a public object and the realm renders it
-- to signed out visitors. Adding an age attestation to that table would put a
-- compliance fact one accidental grant away from a public read, and the grants
-- on that table are wide enough that the accident is plausible.
--
-- So it sits in its own table, deny by default, no grants to any browser role,
-- reachable only through the service role in a route. The Muster put three
-- columns on profiles for a good reason and this puts none there for a better
-- one: attendance is public and an age attestation is not.
--
-- MINIMAL BY DESIGN. There is no date of birth column and there must never be
-- one. The gate asks "at least eighteen" and stores that it was answered, when,
-- and against which minimum. A birth date is identifying data the realm would
-- then owe a duty of care over, and it answers a question nobody asked.

create table if not exists public.member_commerce_limits (
  profile_id uuid not null,

  -- THE AGE GATE. A self declaration, and named as one everywhere it appears.
  -- age_attested_minimum records the threshold in force at the time so that
  -- raising the minimum later re-asks everybody rather than grandfathering
  -- them silently, which a bare boolean could not express.
  age_attested_at timestamptz,
  age_attested_minimum integer,

  -- THE SEAM FOR REAL VERIFICATION. Nothing writes these today. A document or
  -- credit check provider is a paid service (rule 19) and the realm does not
  -- have one, so the columns exist to be filled by one later rather than to
  -- suggest one exists now. A route reading them must treat null as "never
  -- verified", never as "verified by default".
  age_verified_at timestamptz,
  age_verification_method text,

  -- THE MEMBER SET CAP, applied to the 30 day window alongside the realm's own.
  -- Null means the member has set none and only the realm's cap applies.
  self_cap_minor integer,
  -- A RAISE IN WAITING. Lowering a self cap takes effect at once; raising one
  -- waits, and until pending_self_cap_at passes, the lower cap in
  -- self_cap_minor is still the one enforced. That asymmetry is the difference
  -- between a self limit and a slider: a limit a member can raise in the moment
  -- they want to raise it is not a limit.
  pending_self_cap_minor integer,
  pending_self_cap_at timestamptz,

  -- THE INFORMED CONSENT INTERRUPTION. acknowledged_spend_minor is the real 30
  -- day total the SERVER computed and showed the member, never a number the
  -- client sent, so the row is evidence of what they were actually shown.
  acknowledged_at timestamptz,
  acknowledged_spend_minor integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_commerce_limits_pkey primary key (profile_id),
  constraint member_commerce_limits_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint member_commerce_limits_age_minimum_check
    check (age_attested_minimum is null or age_attested_minimum between 13 and 25),
  constraint member_commerce_limits_self_cap_check
    check (self_cap_minor is null or self_cap_minor >= 0),
  constraint member_commerce_limits_pending_cap_check
    check (pending_self_cap_minor is null or pending_self_cap_minor >= 0),
  -- A pending raise without a time to land, or a time with nothing to land, is
  -- a half written intention that a later reader would have to guess about.
  constraint member_commerce_limits_pending_pair_check
    check ((pending_self_cap_minor is null) = (pending_self_cap_at is null)),
  constraint member_commerce_limits_ack_check
    check (acknowledged_spend_minor is null or acknowledged_spend_minor >= 0),
  constraint member_commerce_limits_verification_method_check
    check (
      age_verification_method is null
      or (age_verification_method <> ''::text and char_length(age_verification_method) <= 40)
    )
);

-- ============================================================
-- 2. The refusal ledger
-- ============================================================
--
-- Every time a guardrail turns a member away, a row lands here. This is the
-- half of a compliance posture that is easy to leave out and impossible to
-- reconstruct afterwards: a guardrail that refuses and keeps no record cannot
-- answer the only question anybody will ever ask it, which is "show me that it
-- fires".
--
-- It records the refusal, not the member's data: a kind, and a detail object
-- carrying the numbers the decision turned on. No cart, no card, no address.

create table if not exists public.commerce_guard_events (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  -- One of the names in GUARD_REASONS (lib/commerce/compliance.ts), or an alms
  -- refusal. Deliberately a text check rather than an enum: an enum would need
  -- a migration to add a reason, and a reason that cannot be added is a reason
  -- that gets logged under the wrong name.
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commerce_guard_events_pkey primary key (id),
  constraint commerce_guard_events_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint commerce_guard_events_kind_check
    check (kind <> ''::text and char_length(kind) <= 40)
);

create index if not exists commerce_guard_events_profile_idx
  on public.commerce_guard_events (profile_id, created_at desc);

-- A refusal is only useful in aggregate if it can be counted by kind over a
-- period. This is the index that makes "how often did the velocity brake fire
-- last week" a question anyone can answer.
create index if not exists commerce_guard_events_kind_idx
  on public.commerce_guard_events (kind, created_at desc);

-- ============================================================
-- 3. Geo, recorded on the order
-- ============================================================
--
-- Two columns rather than one, because the country alone is worthless without
-- knowing how it was arrived at. 'platform-header' is an edge network's guess
-- from an address, defeated by any VPN. A later 'payment-provider' value would
-- be the card's issuing country, which is materially stronger because a card is
-- issued against a real address. Storing them in the same column with no source
-- would flatten two very different confidences into one, and whoever read it
-- later would have no way to tell them apart.
--
-- Null country is a first class value meaning "could not be established", and
-- is never to be read as an allowed default.

alter table public.orders
  add column if not exists geo_country text,
  add column if not exists geo_source text;

alter table public.orders
  drop constraint if exists orders_geo_country_check;
alter table public.orders
  add constraint orders_geo_country_check
  check (geo_country is null or geo_country ~ '^[A-Z]{2}$');

alter table public.orders
  drop constraint if exists orders_geo_source_check;
alter table public.orders
  add constraint orders_geo_source_check
  check (
    geo_source is null
    or geo_source = any (array['platform-header'::text, 'payment-provider'::text, 'none'::text])
  );

-- ============================================================
-- 4. The Alms: a third way a chest entitlement can exist
-- ============================================================
--
-- The free path grants a REAL entitlement, not a token and not a coupon. It is
-- a row in the same ledger a purchase writes, differing only in source_kind,
-- and it opens through the same route against the same committed seed on the
-- same printed odds with the same guaranteed floor and the same provable
-- reveal. There is no code path anywhere that reads source_kind and rolls
-- differently, and there must never be one: that is the property that makes
-- this a free method of entry rather than a consolation prize.
--
-- The live constraint was read out of the database first, per the README, and
-- was ('order', 'redemption'), matching 20260812224950_commerce_engine.sql.
-- This adds a value and removes none.

alter table public.chest_entitlements
  drop constraint if exists chest_entitlements_source_kind_check;
alter table public.chest_entitlements
  add constraint chest_entitlements_source_kind_check
  check (source_kind = any (array['order'::text, 'redemption'::text, 'amoe'::text]));

-- The two reads the Alms makes, both partial so they stay small however many
-- purchased entitlements exist. The first answers "when did this member last
-- claim", the second answers "how many has the realm given today".
create index if not exists chest_entitlements_amoe_member_idx
  on public.chest_entitlements (profile_id, created_at desc)
  where source_kind = 'amoe'::text;

create index if not exists chest_entitlements_amoe_day_idx
  on public.chest_entitlements (created_at desc)
  where source_kind = 'amoe'::text;

-- ============================================================
-- 9. Seal everything
-- ============================================================
--
-- Deny by default on both tables, and every function revoked from the browser
-- roles. Supabase publishes every public function at /rest/v1/rpc/<name> and
-- the anon key ships in the browser bundle, so a function that grants a free
-- chest and is callable by anon is a faucet with a public tap. See
-- 20260811090000_revoke_public_execute_on_economy_rpcs.sql for the incident
-- this rule comes from.

alter table public.member_commerce_limits enable row level security;
alter table public.commerce_guard_events enable row level security;

revoke all on public.member_commerce_limits from anon, authenticated;
revoke all on public.commerce_guard_events from anon, authenticated;
