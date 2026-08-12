-- C1: enforce post audience selection at the database, not in the browser.
--
-- Before this migration the posts SELECT policy was `USING (NOT deleted)` and
-- the visibility column ('public' | 'followers' | 'house' | 'mentions') was not
-- enforced anywhere in the database. The feed ran in the browser under
-- NEXT_PUBLIC_SUPABASE_ANON_KEY (which ships inside the bundle) and narrowed
-- the audience with a client-built PostgREST .or() string plus a JS filter.
-- That is a query convenience, not a security boundary: anyone holding the anon
-- key could read every "Followers only", "House only" and "Mentions only" raven
-- by querying /rest/v1/posts directly. The same hole existed on comments, whose
-- policy was `USING (NOT deleted)` with no reference to the parent raven at all.
--
-- There is no Supabase Auth session in this app (auth is Privy, so auth.uid()
-- is always null), which means RLS cannot identify the viewer and cannot
-- evaluate the follower / House / mention circles on its own. The feed
-- therefore moves behind a server route (GET /api/feed, GET /api/posts/[id],
-- GET /api/comments) that resolves the viewer from the Privy bearer token and
-- reads with the service role, which bypasses RLS.
--
-- What this migration does is the defence in depth underneath that route: the
-- anon key can now only ever see PUBLIC, undeleted ravens and the comments
-- hanging off them. A restricted raven is unreachable over PostgREST no matter
-- what filter the caller writes. Server routes are unaffected: the service role
-- bypasses RLS entirely.

-- Ravens: public and undeleted only.
drop policy if exists "public read" on public.posts;
create policy "public read"
  on public.posts
  for select
  to public
  using (not deleted and visibility = 'public');

-- Comments inherit their raven's audience. A comment on a restricted raven is
-- itself restricted, so the anon key must not see it. The subquery is
-- evaluated under the caller's own role, so the posts policy above applies to
-- it as well; the visibility test is repeated here so the intent survives any
-- future change to the posts policy.
drop policy if exists "public read" on public.comments;
create policy "public read"
  on public.comments
  for select
  to public
  using (
    not deleted
    and exists (
      select 1
        from public.posts p
       where p.id = public.comments.post_id
         and not p.deleted
         and p.visibility = 'public'
    )
  );

-- The comments policy joins back to posts on post_id, so give it an index.
create index if not exists comments_post_id_idx on public.comments (post_id);

-- The server feed reads restricted ravens by audience: by author (own ravens
-- and the followers circle) and by House. Both are ordered by created_at.
create index if not exists posts_author_created_idx
  on public.posts (author_id, created_at desc);
create index if not exists posts_house_created_idx
  on public.posts (house_slug, created_at desc)
  where house_slug is not null;
