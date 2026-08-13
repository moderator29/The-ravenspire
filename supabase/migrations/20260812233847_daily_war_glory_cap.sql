-- A daily ceiling on War Glory, and one capped-award function instead of two.
--
-- THE HOLE
-- Social Renown has been capped since the Calls V2 migration, for a reason
-- written down there: likes, reravens and comments are unbounded actions that
-- two colluding accounts can perform on each other forever. The War was left
-- uncapped, and it is the larger hole of the two, because it does not even
-- need a second account.
--
-- The numbers. A settled battle pays up to 400 Glory and the route allows
-- twelve settled battles an hour. That is 4,800 Glory an hour and roughly
-- 115,000 a day from one member, against a social ceiling of 200 a day. Glory
-- is not a private score: it is added to the member's House, it decides the
-- Clash and it decides the Season. So the ladder, the Throne and the Season
-- reward vault were all settleable by whoever was willing to leave a client
-- running, and no other check in the product would have noticed.
--
-- THE CEILING
-- 1,500 Glory a day. Ten decisive victories is a long evening in the War and
-- lands under it; a client grinding twelve battles an hour crosses it in about
-- ninety minutes and earns nothing beyond. The War stays worth playing and
-- stops being worth farming. It is a per-category allowance, so it neither
-- spends nor is spent by the social one.
--
-- ONE FUNCTION
-- award_social_capped was already the right shape and the wrong name: every
-- line of it is generic except the literal 'social' in two places. Rather than
-- copy ninety lines and change a word, it becomes award_capped with the
-- category as a parameter, and award_social_capped stays as a delegating
-- wrapper so nothing that calls it by the old name breaks. Two copies of a
-- function that mints Renown is how one of them ends up fixed and the other
-- does not.
--
-- Both are SECURITY DEFINER and both mint Renown, so both are exactly the
-- shape of the exploit closed in 20260811090000: Supabase publishes every
-- public function at /rest/v1/rpc/<name> and the anon key ships in the browser
-- bundle. service_role only, and nothing else, ever.

create or replace function public.award_capped(
  p_profile_id uuid,
  p_points integer,
  p_glory integer,
  p_reason text,
  p_ref uuid,
  p_daily_cap integer,
  p_category text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_room integer;
  v_points integer;
  v_glory integer;
  v_house text;
begin
  if p_points <= 0 and p_glory <= 0 then
    return jsonb_build_object('points', 0, 'glory', 0, 'capped', false);
  end if;

  -- Serialises every capped award for this member, so the sum below and the
  -- insert further down cannot interleave with another request doing the same.
  -- Without it two concurrent battles both see room and both spend it.
  perform 1 from public.profiles where id = p_profile_id for update;

  select coalesce(sum(points_delta + glory_delta), 0)
    into v_used
    from public.points_ledger
   where profile_id = p_profile_id
     and category = p_category
     and created_at >= date_trunc('day', now() at time zone 'utc');

  v_room := greatest(p_daily_cap - v_used, 0);
  if v_room <= 0 then
    return jsonb_build_object('points', 0, 'glory', 0, 'capped', true);
  end if;

  -- The allowance is spent on points before glory, because Renown is points
  -- plus glory and points are the member-visible balance.
  v_points := least(greatest(p_points, 0), v_room);
  v_glory := least(greatest(p_glory, 0), v_room - v_points);

  if v_points = 0 and v_glory = 0 then
    return jsonb_build_object('points', 0, 'glory', 0, 'capped', true);
  end if;

  insert into public.points_ledger
    (profile_id, points_delta, glory_delta, reason, ref, category)
  values
    (p_profile_id, v_points, v_glory, p_reason, p_ref, p_category);

  update public.profiles
     set points = points + v_points,
         glory = glory + v_glory,
         renown = renown + v_points + v_glory,
         tier = case
           when renown + v_points + v_glory >= 15000 then 'king'
           when renown + v_points + v_glory >= 7000 then 'hand'
           when renown + v_points + v_glory >= 3000 then 'warden'
           when renown + v_points + v_glory >= 1200 then 'lord'
           when renown + v_points + v_glory >= 400 then 'knight'
           when renown + v_points + v_glory >= 100 then 'squire'
           else 'smallfolk'
         end
   where id = p_profile_id
   returning house_slug into v_house;

  -- House Glory rises with the member's, which is precisely why this needs a
  -- ceiling: an uncapped grind here moved a whole House up the Season board.
  if v_glory > 0 and v_house is not null then
    update public.houses set glory = glory + v_glory where slug = v_house;
  end if;

  return jsonb_build_object(
    'points', v_points,
    'glory', v_glory,
    'capped', (v_points < greatest(p_points, 0) or v_glory < greatest(p_glory, 0))
  );
end;
$$;

-- The old name, delegating. Kept so that any caller written against it keeps
-- working and keeps getting the fixed implementation rather than a stale copy.
create or replace function public.award_social_capped(
  p_profile_id uuid,
  p_points integer,
  p_glory integer,
  p_reason text,
  p_ref uuid,
  p_daily_cap integer
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.award_capped(
    p_profile_id, p_points, p_glory, p_reason, p_ref, p_daily_cap, 'social'
  );
$$;

revoke all on function public.award_capped(uuid, integer, integer, text, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.award_social_capped(uuid, integer, integer, text, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.award_capped(uuid, integer, integer, text, uuid, integer, text)
  to service_role;
grant execute on function public.award_social_capped(uuid, integer, integer, text, uuid, integer)
  to service_role;
