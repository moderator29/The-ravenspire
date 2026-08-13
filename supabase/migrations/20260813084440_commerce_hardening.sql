-- Commerce backend hardening. Additive; sealed behind the realm flags.
--
-- RECOVERED FILE, and the fourth time the repository and the live database
-- have been found to disagree. This ran on project tqvigouaifbklvajiyoj as
-- version 20260813084440, from a session whose branch reached main without its
-- migration file, so production carried a changed constraint, an index and four
-- SECURITY DEFINER functions that nothing in the repository described. The text
-- below is the applied statement, read back out of
-- supabase_migrations.schema_migrations and committed verbatim.
--
-- WHY THIS ONE MATTERED MORE THAN THE OTHERS. The first line of it widens
-- points_ledger_category_check to admit 'war', and public.award_capped (from
-- 20260813140000, built in parallel by the other session) writes exactly that
-- category. The repository's own history has the constraint as ('social',
-- 'call'), so anybody rebuilding a database from these files would get a War
-- economy that throws on every award, and the next migration to touch that
-- constraint would silently drop 'war' unless its author happened to inspect
-- production. That is not hypothetical: it is precisely what the staked Calls
-- migration did on its first pass, and it was caught in review rather than by
-- any test, because no test can see a constraint that only exists in one place.
--
-- Two of the four functions here are superseded and are dropped by
-- 20260815090000_retire_the_superseded_rpcs.sql, which explains why.

alter table public.points_ledger
  drop constraint if exists points_ledger_category_check;
alter table public.points_ledger
  add constraint points_ledger_category_check check (
    category is null
    or category = any (array['social'::text, 'call'::text, 'war'::text])
  );

create index if not exists points_ledger_war_daily_idx
  on public.points_ledger (profile_id, created_at desc)
  where category = 'war'::text;

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

create index if not exists fulfillments_pending_idx
  on public.fulfillments (created_at)
  where status = 'pending'::text;

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
