-- The Bazaar, part 4 of 4: settlement, the two guard triggers, and every grant
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
