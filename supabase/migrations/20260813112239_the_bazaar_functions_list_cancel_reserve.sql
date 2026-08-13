-- The Bazaar, part 2 of 4: listing a card and cancelling a listing
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
