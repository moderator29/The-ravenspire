-- Whispers rich media: multiple images per message, and video, mirroring how
-- posts.media is already shaped (jsonb array of {url, type}). Read live
-- before writing, per supabase/migrations/README.md: `messages` has exactly
-- id, conversation_id, sender_id, body, created_at, image_url, RLS enabled
-- with no policy (deny by default, same as every whispers table), and one
-- check constraint, messages_body_or_image_present, confirmed via
-- information_schema and pg_constraint immediately before this migration was
-- written:
--   CHECK (((body IS NOT NULL) AND (length(btrim(body)) > 0)) OR (image_url IS NOT NULL))
--
-- `image_url` is kept, untouched, for the rows that already carry it and for
-- any reader that has not migrated: nothing here breaks a single-image
-- message written before this ran. New sends write `media` instead and leave
-- image_url null; the client renders whichever one a message actually
-- carries. The constraint is widened, not replaced, so every row that
-- satisfied it before still does.
alter table public.messages
  add column if not exists media jsonb not null default '[]'::jsonb;

alter table public.messages
  drop constraint if exists messages_body_or_image_present;

alter table public.messages
  add constraint messages_body_or_image_present check (
    (body is not null and length(btrim(body)) > 0)
    or image_url is not null
    or jsonb_array_length(media) > 0
  );
