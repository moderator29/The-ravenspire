-- Ban and verify state for members. The admin panel writes these; enforcement
-- of is_banned (403 in requireProfile, exclusion from feed queries) is handled
-- separately.
alter table public.profiles
  add column if not exists is_banned boolean not null default false,
  add column if not exists is_verified boolean not null default false;
