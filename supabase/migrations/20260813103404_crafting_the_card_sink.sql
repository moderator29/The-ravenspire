-- Crafting: the card sink, and the transaction that makes a burn indivisible.
--
-- WHY
-- The collectibles realm mints and never destroys. public.inventory is written
-- by chest opening and by redemption, one row per copy, and nothing has ever
-- removed a row from it. A forty card set opened out of five card chests means
-- most of what a member holds is a second or third copy of something they
-- already have, and a duplicate a collector cannot do anything with is worth
-- nothing to them and worth less than nothing to the economy: it is supply
-- with no demand under it.
--
-- Crafting is the sink. Burn N copies of one rarity, forge one card of the
-- rarity above. The ratios live in lib/collectibles/crafting.ts, where they are
-- asserted at module load against the real chest odds and the real per rarity
-- floor, and they are deliberately set so that a craft destroys more floor
-- value than it creates and is never a cheaper route to a rarity than the box
-- that sells it. Read that file's header before changing anything here.
--
-- WHY THIS IS A FUNCTION AND NOT FOUR WRITES FROM A ROUTE
-- A craft is a delete of N rows and an insert of one. From a serverless route
-- that is at least three round trips, and a crash between any two of them is
-- unrecoverable in a way nobody can even diagnose afterwards: either the
-- member's cards are gone and nothing was forged, or a card was forged and the
-- copies that paid for it are still sitting in the ledger, which is a printer.
-- Neither is distinguishable from the other after the fact. This is exactly the
-- lesson public.chest_open was written for (20260813120000, section 42.3 of
-- docs/RAVENSPIRE-V2.md), applied to the other end of the same ledger.
--
-- WHY A CARD CARRIED ON-CHAIN CANNOT BE BURNED
-- The claim loop (20260813090000) lets a member mint a copy to their own
-- wallet. Once that has happened the member holds a token the platform cannot
-- reach, because the platform never had custody of it. Deleting the ledger row
-- underneath it would leave the database saying they hold nothing and the chain
-- saying they hold something, and the chain would be right. So a copy carrying
-- an issued, submitted or minted claim is refused: the same three statuses the
-- partial unique index in the claim ledger calls live. Expired and void claims
-- are dead history and do not stand in the way.
--
-- The refusal is enforced by two independent mechanisms, and the second one is
-- the interesting one. The explicit status check below catches a claim that
-- already exists. A claim being issued at the same moment is caught by the row
-- lock: inserting a row that references public.inventory takes a FOR KEY SHARE
-- lock on the referenced row, and FOR KEY SHARE conflicts with the FOR UPDATE
-- this function takes, so a concurrent claim issuance blocks until the craft
-- commits and then fails its own foreign key. Without that, a voucher could be
-- signed against a copy that this transaction is in the middle of destroying,
-- and the member would meet the failure in their own wallet after paying gas.
-- FOR UPDATE rather than FOR NO KEY UPDATE is therefore load bearing.
--
-- WHY THE BURNED ROWS ARE DELETED RATHER THAN FLAGGED
-- A `burned_at` column was the other option and it is the worse one. Every read
-- of the holdings ledger in the product (the Hoard, both inventory routes, the
-- claim route) would need to filter on it, and the day one of them forgets is
-- the day a member sees a card they burned and can act on it. A deleted row
-- cannot be misread by a query nobody updated. The history is not lost: the
-- craft event records every burned copy in full, denormalised, because the rows
-- it describes no longer exist to be joined against.
--
-- RLS
-- Deny by default to every browser role, the same posture as the collectibles
-- foundation, the commerce engine and the claim ledger, and for the same
-- architectural reason: this stack authenticates with Privy, so auth.uid() is
-- always null and an owner policy written against it would match nothing and
-- protect nothing. Ownership is enforced in the route, which resolves the
-- member from a verified Privy token, and again under the row lock here.
--
-- Nothing crafts anything today. crafting_live ships off, chest opening is
-- sealed, and the holdings ledger is empty, so the route answers honestly on
-- all three counts.

-- ------------------------------------------------------------------
-- 1. The launch switch.
-- ------------------------------------------------------------------

-- A fifth chapter switch beside reliquary_live, chests_live, mercer_live and
-- mint_live. Off, and it stays off until members actually hold duplicates:
-- a bench with nothing on it is not a feature, it is a locked door with a
-- handle. Never re-seals a flag an operator has since flipped.
insert into public.realm_flags (key, enabled)
values ('crafting_live', false)
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 2. A third way a card can enter the ledger.
-- ------------------------------------------------------------------
--
-- inventory.source was constrained to 'chest_opening' and 'redemption', which
-- were the only two writers when the commerce engine landed. A forged card is
-- neither, and calling it either would be a lie in the one column that answers
-- "where did this come from". Dropped and re-added rather than widened in
-- place, because a check constraint cannot be altered.

alter table public.inventory
  drop constraint if exists inventory_source_check;
alter table public.inventory
  add constraint inventory_source_check
  check (source = any (array[
    'chest_opening'::text,
    'redemption'::text,
    'craft'::text
  ]));

-- ------------------------------------------------------------------
-- 3. The craft ledger.
-- ------------------------------------------------------------------
--
-- One row per craft. The row IS the audit trail, and it has to stand alone:
-- the copies it describes were deleted in the same transaction that wrote it,
-- so there is nothing left to join to. A member disputing what they burned is
-- answered by reading this row, and by nothing else.

create table if not exists public.craft_events (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  -- A craft happens inside one set. Recorded so a future set cannot make this
  -- history ambiguous.
  set_slug text not null,
  from_rarity text not null,
  to_rarity text not null,
  -- The ratio this craft actually paid, stored rather than looked up. The rule
  -- in code is the current rule; a ledger row has to remember the rule that
  -- was in force when it was written, or every past craft silently re-prices
  -- itself the day a ratio changes.
  burned_count integer not null,
  -- Every destroyed copy, denormalised: its id, collector number, champion and
  -- rarity. The ids are a record of what was destroyed and deliberately carry
  -- no foreign key, because the rows they name are gone by the time this is
  -- written and a constraint pointing at nothing would refuse the insert.
  burned jsonb not null default '[]'::jsonb,
  -- The card that came out. Set null rather than cascaded if that card is
  -- itself later burned in another craft: the history of this craft has to
  -- survive the fate of what it produced, or climbing the ladder would erase
  -- the record of every rung below.
  forged_inventory_id uuid,
  created_at timestamptz not null default now(),
  constraint craft_events_pkey primary key (id),
  constraint craft_events_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint craft_events_forged_inventory_id_fkey
    foreign key (forged_inventory_id) references public.inventory (id)
    on delete set null,
  constraint craft_events_set_slug_check check (set_slug <> ''::text),
  constraint craft_events_from_rarity_check
    check (from_rarity = any (array['rare'::text, 'epic'::text, 'legendary'::text])),
  constraint craft_events_to_rarity_check
    check (to_rarity = any (array['epic'::text, 'legendary'::text, 'mythic'::text])),
  -- A craft that forged what it burned is not a craft. The one rung rule
  -- itself is enforced in the function, where the ladder order is known.
  constraint craft_events_step_check check (from_rarity <> to_rarity),
  -- Two whole cards is the least a sink can burn. The real ratios are four and
  -- ten; this is the floor under any future one.
  constraint craft_events_burned_count_check check (burned_count >= 2),
  constraint craft_events_burned_check check (jsonb_typeof(burned) = 'array')
);

-- A member's own crafting history, newest first, which is what the bench and
-- the Chronicle read.
create index if not exists craft_events_profile_created_idx
  on public.craft_events (profile_id, created_at desc);

-- "Where did this card come from" for a forged copy, answered without a scan.
create index if not exists craft_events_forged_idx
  on public.craft_events (forged_inventory_id)
  where forged_inventory_id is not null;

alter table public.craft_events enable row level security;

-- Deny by default, made explicit. A member reads their crafting history
-- through the route, which resolves them from a verified Privy token; an
-- auth.uid() owner policy here would match nothing. Nothing in the product
-- lets a browser write this table: a craft the crafter can record is a
-- self-issued receipt for cards nobody burned.
drop policy if exists "craft events owner only" on public.craft_events;
create policy "craft events owner only"
  on public.craft_events for select using (false);

revoke all on public.craft_events from anon, authenticated;

-- ------------------------------------------------------------------
-- 4. The craft, atomically.
-- ------------------------------------------------------------------
--
-- Takes a craft that lib/collectibles/crafting.ts has already decided is legal
-- and makes it happen exactly once, or not at all. It does not re-derive the
-- rule, because the rule needs the card catalog and the catalog is code: it
-- derives from the champion roster, the single source of truth, and copying
-- forty cards into the database so plpgsql could look them up would be
-- creating a second roster to disagree with the first. Same division of labour
-- as public.chest_open: the route decides, the function settles, and the
-- function is what makes the settling indivisible.
--
-- It does re-check everything that can be checked without the catalog, and it
-- does so under the lock rather than trusting the route's read: ownership, the
-- set, the rarity, the count, the absence of a duplicate id, the absence of a
-- live claim, and that the forged rarity is exactly one rung above the burned
-- one. The last of those is the important one. A bug anywhere in the route
-- could otherwise mint a mythic out of four rares, and a minted card is not
-- retractable once a member has claimed it to their own wallet.
--
-- Returns a jsonb verdict rather than raising, because a craft has several
-- honest ways to fail and a member deserves to be told which. Every refusal
-- returns before the first write, so a refused craft leaves no trace.

create or replace function public.craft_cards(
  p_profile_id uuid,
  p_set_slug text,
  p_from_rarity text,
  p_to_rarity text,
  -- The copies the member named. Order does not matter; distinctness does.
  p_burn_ids uuid[],
  -- The ratio the rule says this step costs, passed so the function can refuse
  -- a route that named a different number of copies than the rule charges.
  p_required integer,
  -- The forged card, resolved from the real set by the caller:
  -- { set_slug, card_number, champion_slug, rarity }.
  p_card jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The rarity ladder, low to high, as the database knows it. The same four
  -- rungs the inventory rarity constraint allows and the same four
  -- lib/collectibles/crafting.ts walks.
  v_ladder text[] := array['rare', 'epic', 'legendary', 'mythic'];
  v_from_rung integer;
  v_to_rung integer;
  v_distinct integer;
  v_locked integer;
  v_blocked integer;
  v_burned jsonb;
  v_craft_id uuid;
  v_forged_id uuid;
begin
  -- A ratio below two is not a sink. Guards against a caller passing a null or
  -- a one, which would let a member launder one card into a better one.
  if p_required is null or p_required < 2 then
    return jsonb_build_object('ok', false, 'error', 'bad_rule');
  end if;

  v_from_rung := array_position(v_ladder, p_from_rarity);
  v_to_rung := array_position(v_ladder, p_to_rarity);

  -- Exactly one rung up. This is the rule the whole feature is named after and
  -- it is the last line of defence against a route that got it wrong: no
  -- crafting sideways, none downward, and none skipping a rarity.
  if v_from_rung is null or v_to_rung is null or v_to_rung <> v_from_rung + 1 then
    return jsonb_build_object('ok', false, 'error', 'bad_step');
  end if;

  -- The forged card must be the card the caller said it was, in the set the
  -- burn came from and at the rarity the step forges. Cheap, and it turns a
  -- mismatched payload into a refusal rather than into a wrong card in
  -- somebody's collection.
  -- The collector number is pattern checked before it is cast. A cast of
  -- arbitrary text raises rather than returning, which would abort the
  -- transaction with a database error instead of the honest verdict this
  -- function exists to give. Nine digits also keeps it inside an integer, so
  -- the cast itself cannot overflow.
  if p_card is null
     or coalesce(p_card ->> 'set_slug', '') <> p_set_slug
     or coalesce(p_card ->> 'rarity', '') <> p_to_rarity
     or coalesce(p_card ->> 'champion_slug', '') = ''
     or coalesce(p_card ->> 'card_number', '') !~ '^[0-9]{1,9}$'
     or (p_card ->> 'card_number')::integer <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_card');
  end if;

  if p_burn_ids is null
     or coalesce(array_length(p_burn_ids, 1), 0) <> p_required then
    return jsonb_build_object('ok', false, 'error', 'wrong_count');
  end if;

  -- The double spend. Naming one copy four times reads as four copies to
  -- anything that measures the array, and the delete below is keyed on
  -- `id = any(...)`, which would remove it once: one card in, one better card
  -- out. Checked here as well as in the rule module, because this is the one
  -- malformed craft that would actually have worked.
  select count(distinct x) into v_distinct from unnest(p_burn_ids) as t(x);
  if v_distinct <> p_required then
    return jsonb_build_object('ok', false, 'error', 'duplicate_copy');
  end if;

  -- Lock every named copy for the length of the transaction, scoped to the
  -- member, the set and the rarity in the same predicate. Two crafts racing on
  -- one copy serialise here and the second finds it gone. Ordered by id so two
  -- crafts sharing copies always take their locks in the same order and cannot
  -- deadlock against each other.
  --
  -- FOR UPDATE specifically: see the header. It conflicts with the FOR KEY
  -- SHARE that a concurrent claim insert takes on these same rows, which is
  -- what stops a voucher being signed against a copy this craft is destroying.
  select count(*) into v_locked
    from (
      select id
        from public.inventory
       where id = any (p_burn_ids)
         and profile_id = p_profile_id
         and set_slug = p_set_slug
         and rarity = p_from_rarity
       order by id
       for update
    ) locked;

  -- Anything short means at least one named copy is not this member's, is not
  -- of this set or rarity, or was burned by another craft between the route's
  -- read and this lock. All three are the same answer from where the member
  -- stands: the ledger no longer holds what they asked to burn.
  if v_locked <> p_required then
    return jsonb_build_object('ok', false, 'error', 'copies_moved');
  end if;

  -- A copy already carried to the member's own wallet cannot be burned off
  -- chain. They still hold the token, and destroying the ledger row would put
  -- the platform and the chain into permanent disagreement about who owns
  -- what, with the chain being right.
  select count(*) into v_blocked
    from public.collectible_claims
   where inventory_id = any (p_burn_ids)
     and status = any (array['issued'::text, 'submitted'::text, 'minted'::text]);

  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'carried_on_chain');
  end if;

  -- Photograph the copies before they cease to exist. This is the whole audit
  -- trail, because after the delete there is nothing left to join to.
  select jsonb_agg(
           jsonb_build_object(
             'id', id,
             'card_number', card_number,
             'champion_slug', champion_slug,
             'rarity', rarity,
             'source', source
           )
           order by card_number, id
         )
    into v_burned
    from public.inventory
   where id = any (p_burn_ids)
     and profile_id = p_profile_id;

  delete from public.inventory
   where id = any (p_burn_ids)
     and profile_id = p_profile_id;

  insert into public.craft_events (
    profile_id, set_slug, from_rarity, to_rarity, burned_count, burned
  )
  values (
    p_profile_id,
    p_set_slug,
    p_from_rarity,
    p_to_rarity,
    p_required,
    coalesce(v_burned, '[]'::jsonb)
  )
  returning id into v_craft_id;

  -- The forged card, in the holdings ledger like any other. source_id points
  -- back at the craft that made it, so every card in the realm can name where
  -- it came from, exactly as a pulled card names its chest opening.
  insert into public.inventory (
    profile_id, set_slug, card_number, champion_slug, rarity, source, source_id
  )
  values (
    p_profile_id,
    p_card ->> 'set_slug',
    (p_card ->> 'card_number')::integer,
    p_card ->> 'champion_slug',
    p_card ->> 'rarity',
    'craft',
    v_craft_id
  )
  returning id into v_forged_id;

  update public.craft_events
     set forged_inventory_id = v_forged_id
   where id = v_craft_id;

  return jsonb_build_object(
    'ok', true,
    'craft_id', v_craft_id,
    'inventory_id', v_forged_id
  );
end;
$$;

-- EXECUTE to service_role ONLY. Supabase publishes every public function at
-- /rest/v1/rpc/<name> and the anon key ships in the browser bundle, so a public
-- grant here would let anyone in the world call this against their own profile
-- id and mint themselves cards, or call it against somebody else's and burn
-- theirs. This function both destroys and creates property, which makes it the
-- single most dangerous entry point in the collectibles realm. See
-- 20260811090000_revoke_public_execute_on_economy_rpcs.sql for the incident the
-- rule comes from.
revoke all on function public.craft_cards(uuid, text, text, text, uuid[], integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.craft_cards(uuid, text, text, text, uuid[], integer, jsonb)
  to service_role;
