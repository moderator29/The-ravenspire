-- Atomic reward application. Replaces the non atomic select then update of
-- profiles and houses in lib/points.ts so concurrent awards cannot lose
-- increments. Tier is recomputed from the new renown inside the same update.
create or replace function public.increment_profile_totals(
  p_profile_id uuid,
  p_points integer,
  p_glory integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_house text;
begin
  update public.profiles
     set points = points + p_points,
         glory = glory + p_glory,
         renown = renown + p_points + p_glory,
         tier = case
           when renown + p_points + p_glory >= 15000 then 'king'
           when renown + p_points + p_glory >= 7000 then 'hand'
           when renown + p_points + p_glory >= 3000 then 'warden'
           when renown + p_points + p_glory >= 1200 then 'lord'
           when renown + p_points + p_glory >= 400 then 'knight'
           when renown + p_points + p_glory >= 100 then 'squire'
           else 'smallfolk'
         end
   where id = p_profile_id
   returning house_slug into v_house;
  return v_house;
end;
$$;

create or replace function public.increment_house_glory(
  p_slug text,
  p_glory integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.houses set glory = glory + p_glory where slug = p_slug;
$$;
