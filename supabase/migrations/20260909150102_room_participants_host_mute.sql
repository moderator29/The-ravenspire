-- Host controls: a host may silence a speaker's mic (a temporary, reversible
-- state distinct from role) without demoting them off the roster. Read live
-- before writing, per supabase/migrations/README.md: room_participants had no
-- check constraints and exactly the four columns (room_id, profile_id, role,
-- joined_at), confirmed via information_schema and pg_constraint immediately
-- before this migration was written. This adds one nullable-free boolean and
-- changes nothing existing.
alter table public.room_participants
  add column if not exists muted boolean not null default false;
