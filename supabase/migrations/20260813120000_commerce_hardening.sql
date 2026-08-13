-- Commerce backend hardening (V2 Part Three, sections 38 and 39). Additive
-- throughout, and everything stays sealed behind the realm flags until launch,
-- the same posture as the commerce engine migration it builds on
-- (20260812130000).
--
-- WHY THIS EXISTS
-- The commerce engine landed money, chest opening, redemption and fulfillment,
-- but four money and reward paths were not yet atomic, capped, or reversible:
--
--   1. Chest opening claimed the entitlement, then wrote the opening, then wrote
--      inventory, in three separate statements. A failure between the first and
--      the last burned a paid chest with no cards. This migration folds the
--      whole thing into one SECURITY DEFINER transaction, open_chest_tx.
--   2. War Glory is self reported and was bounded only by a rate limit. This
--      adds a daily Glory ceiling for the War, mirroring the 200/day social cap,
--      award_war_glory_capped, and a 'war' category on the ledger to measure the
--      day to date total it caps against.
--   3. There was no reversal path. refund_order records a refund and withdraws
--      the unopened digital entitlements from an order, never clawing back an
--      already opened pull, and records the discrepancy honestly.
--   4. Redemption codes recorded attempts but nothing bumped the counter.
--      bump_redemption_attempt makes a hammered code visible.
--
-- Every function here is SECURITY DEFINER, service_role only, the same law as
-- the economy RPCs (20260811090000): Supabase publishes every public function
-- at /rest/v1/rpc/<name> and the anon key ships in the browser bundle, so a
-- function that mints Renown or reverses money must never be callable by anon or
-- authenticated. Money stays integer minor units throughout.

-- ------------------------------------------------------------------
-- 1. The 'war' ledger category, and its day to date index.
-- ------------------------------------------------------------------
--
-- The daily War Glory cap needs to sum the Glory a member drew from the War
-- today, and 'reason' cannot do it: the war reasons are the fixed strings
-- 'war_victory' and 'war_fought', but keeping the cap on a category matches the
-- social cap exactly and stays index friendly. Null stays uncategorised, which
-- is every historical row.

alter table public.points_ledger
  drop constraint if exists points_ledger_category_check;
alter table public.points_ledger
  add constraint points_ledger_category_check check (
    category is null
    or category = any (array['social'::text, 'call'::text, 'war'::text])
  );

-- The daily War allowance query: one member, today, war rows only.
create index if not exists points_ledger_war_daily_idx
  on public.points_ledger (profile_id, created_at desc)
  where category = 'war'::text;

-- ------------------------------------------------------------------
-- 2. open_chest_tx: claim, record, grant, all in one transaction.
-- ------------------------------------------------------------------
--
-- The route computes the pull with the pure lib/commerce/chest-open (the server
-- seed, the hash, the client seed, the nonce and the drawn cards) and passes the
-- finished result in. This function does the three database writes that must
-- either all happen or none happen:
--
--   a. Claim exactly one unopened entitlement for this member and sku. The row
--      is taken with FOR UPDATE SKIP LOCKED, so two concurrent opens claim two
--      different rows rather than fighting over one, and a member with a single
--      chest cannot have it opened twice: the second caller finds no free row.
--   b. Insert the opening (audit plus the revealed seeds).
--   c. Consume the entitlement, linking it to its opening.
--   d. Write the pulled cards to the inventory ledger.
--
-- Returns the opening id, or null when the member holds no unopened chest, in
-- which case nothing is written and the route reports no entitlement. Because it
-- is one function it is one transaction: a failure at (b), (c) or (d) rolls back
-- (a), so a paid chest is never consumed without its cards landing.
--
-- p_cards is the drawn cards as a jsonb array, each element
--   { "card_number": int, "champion_slug": text, "rarity": text, "set_slug": text }
-- exactly as the route already built for the inventory insert, so the pull the
-- member is shown and the pull recorded can never disagree.

create or replace function public.open_chest_tx(
  p_profile_id uuid,
  p_chest_sku text,
  p_server_seed text,
  p_server_seed_hash text,
  p_client_seed text,
  p_nonce integer,
  p_result jsonb,
  p_cards jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement_id uuid;
  v_opening_id uuid;
  v_card jsonb;
begin
  select id
    into v_entitlement_id
    from public.chest_entitlements
   where profile_id = p_profile_id
     and chest_sku = p_chest_sku
     and opened_at is null
   order by created_at asc
   for update skip locked
   limit 1;

  if v_entitlement_id is null then
    return null;
  end if;

  insert into public.chest_openings
    (profile_id, chest_sku, result, server_seed_hash,
     server_seed, client_seed, nonce, opened_at)
  values
    (p_profile_id, p_chest_sku, p_result, p_server_seed_hash,
     p_server_seed, p_client_seed, p_nonce, now())
  returning id into v_opening_id;

  update public.chest_entitlements
     set opened_at = now(),
         opening_id = v_opening_id
   where id = v_entitlement_id;

  for v_card in select * from jsonb_array_elements(p_cards)
  loop
    insert into public.inventory
      (profile_id, set_slug, card_number, champion_slug, rarity, source, source_id)
    values (
      p_profile_id,
      v_card->>'set_slug',
      (v_card->>'card_number')::integer,
      v_card->>'champion_slug',
      v_card->>'rarity',
      'chest_opening',
      v_opening_id
    );
  end loop;

  return v_opening_id;
end;
$$;

-- ------------------------------------------------------------------
-- 3. award_war_glory_capped: the daily War Glory ceiling.
-- ------------------------------------------------------------------
--
-- Modelled line for line on award_social_capped. War Glory is reported by the
-- client and settled by the server; the per battle value is already clamped, and
-- battles are rate limited to a dozen an hour, but nothing bounded the total a
-- member could bank in a day. This is that bound.
--
-- The whole award has to happen inside one function. Reading the day's total in
-- TypeScript and then inserting would leave a window where two concurrent
-- battles both see room and both spend it. Taking the profile row lock first
-- serialises every War award for a member, so the sum and the insert cannot
-- interleave. War Glory is Glory only, no points, matching the existing award.
--
-- Returns the Glory actually granted so the route can tell the member the truth
-- about what counted toward their standing.

create or replace function public.award_war_glory_capped(
  p_profile_id uuid,
  p_glory integer,
  p_reason text,
  p_ref uuid,
  p_daily_cap integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_room integer;
  v_glory integer;
  v_house text;
begin
  if p_glory <= 0 then
    return jsonb_build_object('glory', 0, 'capped', false);
  end if;

  perform 1 from public.profiles where id = p_profile_id for update;

  select coalesce(sum(glory_delta), 0)
    into v_used
    from public.points_ledger
   where profile_id = p_profile_id
     and category = 'war'
     and created_at >= date_trunc('day', now() at time zone 'utc');

  v_room := greatest(p_daily_cap - v_used, 0);
  if v_room <= 0 then
    return jsonb_build_object('glory', 0, 'capped', true);
  end if;

  v_glory := least(p_glory, v_room);

  insert into public.points_ledger
    (profile_id, points_delta, glory_delta, reason, ref, category)
  values
    (p_profile_id, 0, v_glory, p_reason, p_ref, 'war');

  update public.profiles
     set glory = glory + v_glory,
         renown = renown + v_glory,
         tier = case
           when renown + v_glory >= 15000 then 'king'
           when renown + v_glory >= 7000 then 'hand'
           when renown + v_glory >= 3000 then 'warden'
           when renown + v_glory >= 1200 then 'lord'
           when renown + v_glory >= 400 then 'knight'
           when renown + v_glory >= 100 then 'squire'
           else 'smallfolk'
         end
   where id = p_profile_id
   returning house_slug into v_house;

  if v_glory > 0 and v_house is not null then
    update public.houses set glory = glory + v_glory where slug = v_house;
  end if;

  return jsonb_build_object('glory', v_glory, 'capped', v_glory < p_glory);
end;
$$;

-- ------------------------------------------------------------------
-- 4. refund_order: reverse an order, honestly and idempotently.
-- ------------------------------------------------------------------
--
-- A refund records the money reversal and withdraws the digital rights the
-- member has not yet consumed. It is deliberately conservative:
--
--   - Idempotent. It acts only on an order that is currently 'paid' or
--     'fulfilled', and sets it to 'refunded' inside the same locked read, so a
--     redelivered provider event or a repeated admin click reverses once.
--   - Never claws back an opened pull. An opened entitlement is a real card the
--     member holds; those are counted and reported, never deleted. Only the
--     unopened entitlements from this order are withdrawn.
--   - Records the discrepancy. The count of already opened chests is returned so
--     the caller can settle the difference with the member out of band rather
--     than the platform silently eating or hiding it.
--
-- Returns { refunded, reversed, already_opened } on success, or
-- { refunded:false, reason } when the order is missing or not refundable.

create or replace function public.refund_order(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_minor integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_reversed integer := 0;
  v_opened integer := 0;
begin
  select status
    into v_status
    from public.orders
   where id = p_order_id
   for update;

  if v_status is null then
    return jsonb_build_object('refunded', false, 'reason', 'order_not_found');
  end if;

  if v_status = 'refunded' then
    return jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  end if;

  if v_status not in ('paid', 'fulfilled') then
    return jsonb_build_object(
      'refunded', false, 'reason', 'not_refundable', 'status', v_status
    );
  end if;

  select count(*)
    into v_opened
    from public.chest_entitlements
   where source_kind = 'order'
     and source_id = p_order_id
     and opened_at is not null;

  with removed as (
    delete from public.chest_entitlements
     where source_kind = 'order'
       and source_id = p_order_id
       and opened_at is null
    returning 1
  )
  select count(*) into v_reversed from removed;

  update public.orders
     set status = 'refunded',
         updated_at = now()
   where id = p_order_id;

  insert into public.payments
    (order_id, provider, provider_ref, status, amount_minor)
  values
    (p_order_id, p_provider, p_provider_ref, 'refunded', p_amount_minor);

  return jsonb_build_object(
    'refunded', true,
    'reversed', v_reversed,
    'already_opened', v_opened,
    'reason', p_reason
  );
end;
$$;

-- ------------------------------------------------------------------
-- 5. bump_redemption_attempt: make a hammered code visible.
-- ------------------------------------------------------------------
--
-- The redeem route claims a code with a conditional update that matches only an
-- unredeemed row, so a code that is already used or does not exist claims
-- nothing and the two are answered identically (a guesser learns nothing). But
-- the commerce engine added an attempts column and nothing incremented it. This
-- does, keyed by the code hash, so repeated presentations of a real code, used
-- or not, accumulate on the row and a hammering attack is visible to an
-- operator. A hash that matches no row increments nothing, which is correct: a
-- code that does not exist has no row to count against.

create or replace function public.bump_redemption_attempt(
  p_code_hash text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.redemptions
     set attempts = attempts + 1
   where code_hash = p_code_hash;
$$;

-- ------------------------------------------------------------------
-- 6. Fulfillment worker read path: the pending queue.
-- ------------------------------------------------------------------
--
-- The worker sweeps fulfillments still waiting for a vendor. A partial index on
-- the pending status keeps that sweep cheap as shipped rows accumulate.

create index if not exists fulfillments_pending_idx
  on public.fulfillments (created_at)
  where status = 'pending'::text;

-- ------------------------------------------------------------------
-- 7. EXECUTE grants: service_role and nothing else.
-- ------------------------------------------------------------------

revoke all on function public.open_chest_tx(uuid, text, text, text, text, integer, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.award_war_glory_capped(uuid, integer, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.refund_order(uuid, text, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.bump_redemption_attempt(text)
  from public, anon, authenticated;

grant execute on function public.open_chest_tx(uuid, text, text, text, text, integer, jsonb, jsonb)
  to service_role;
grant execute on function public.award_war_glory_capped(uuid, integer, text, uuid, integer)
  to service_role;
grant execute on function public.refund_order(uuid, text, text, integer, text)
  to service_role;
grant execute on function public.bump_redemption_attempt(text)
  to service_role;
