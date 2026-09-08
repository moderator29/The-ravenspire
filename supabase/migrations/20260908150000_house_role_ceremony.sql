alter table public.house_members
  add column if not exists role_celebrated boolean not null default true;
