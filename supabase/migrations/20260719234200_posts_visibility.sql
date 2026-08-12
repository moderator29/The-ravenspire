-- Audience control for ravens. Every existing post is public (the default),
-- so feed behavior is unchanged until an author narrows a raven's reach.
--   public    -> everyone
--   followers -> the author's followers (and the author)
--   house     -> members of the author's House (and the author)
--   mentions  -> handles named in the raven (and the author)
alter table public.posts
  add column if not exists visibility text not null default 'public',
  add column if not exists mentions text[] not null default '{}';

-- Constrain visibility to the known set. Guarded so a re-run is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_visibility_check'
  ) then
    alter table public.posts
      add constraint posts_visibility_check
      check (visibility in ('public', 'followers', 'house', 'mentions'));
  end if;
end $$;

-- Supports the mentions-audience eligibility check (mentions @> {handle}).
create index if not exists posts_mentions_gin on public.posts using gin (mentions);
