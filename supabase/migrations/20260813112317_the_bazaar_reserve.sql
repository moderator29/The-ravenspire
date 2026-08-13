-- The Bazaar, part 3 of 4: reserving a listing for one buyer
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
