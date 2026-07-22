-- Auth+security hardening (AUDIT "Auth + security" #3/#4):
-- profiles is column-restricted for anon/authenticated via column-level SELECT
-- grants (privy_id, wallet_address, settings, is_admin, is_banned remain
-- service-role only). is_verified is a safe, public badge column that was not
-- yet granted; expose it so verified status is publicly readable while the
-- sensitive columns stay locked down. Guarded so it is a no-op if the column
-- is not present yet.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'is_verified'
  ) then
    execute 'grant select (is_verified) on public.profiles to anon, authenticated';
  end if;
end $$;
