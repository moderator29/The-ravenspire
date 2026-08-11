-- Correction to 20260811120000.
--
-- That migration added three indexes to support the server feed's audience
-- reads. All three were already covered by indexes in the baseline schema, so
-- they bought nothing and cost a write on every insert. The Supabase
-- performance advisor flagged the first as an exact duplicate; the other two
-- are redundant for the same reason and are dropped here with it.
--
--   posts_author_created_idx  identical to posts_author_idx
--                             (author_id, created_at desc)
--   posts_house_created_idx   covered by posts_house_idx
--                             (house_slug, created_at desc)
--   comments_post_id_idx      covered by comments_post_idx, whose leading
--                             column is post_id, which is what the comments
--                             RLS policy joins on

drop index if exists public.posts_author_created_idx;
drop index if exists public.posts_house_created_idx;
drop index if exists public.comments_post_id_idx;
