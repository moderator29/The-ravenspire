-- The Realm Event Spine (V2 section 6.1).
--
-- One table that every meaningful act in the realm writes to, so the Ravenry
-- can render a merged stream of what is actually happening instead of only
-- what someone typed into a composer. This is purely additive: no existing
-- table or route changes shape, and nothing reads from here until a caller
-- asks for it.
--
-- Writes go through lib/realm/events.ts emit(), which mirrors the award()
-- pattern in lib/points.ts and runs under the service-role key inside after(),
-- so a failed emit can never fail a member's request.

create table if not exists public.realm_events (
  id uuid not null default gen_random_uuid(),
  kind text not null,
  -- The member who caused it. Null for world events (a season milestone, a
  -- standings shift) that no single member authored.
  actor_id uuid,
  subject_type text,
  -- Deliberately text, not uuid: a subject can be a post id, a house slug, a
  -- crest slug, or a composite key like 'quest-slug:2026-W33'.
  subject_id text,
  house_slug text,
  payload jsonb not null default '{}'::jsonb,
  audience text not null default 'realm'::text,
  created_at timestamp with time zone not null default now(),
  constraint realm_events_pkey primary key (id),
  constraint realm_events_actor_id_fkey foreign key (actor_id)
    references public.profiles(id) on delete cascade,
  constraint realm_events_audience_check check (
    audience = any (array['realm'::text, 'house'::text, 'followers'::text, 'actor'::text])
  ),
  constraint realm_events_kind_check check (kind <> ''::text)
);

-- The Ravenry stream: newest first across the whole realm.
create index if not exists realm_events_created_idx
  on public.realm_events (created_at desc);

-- Filtered streams: one kind, one member, one House.
create index if not exists realm_events_kind_created_idx
  on public.realm_events (kind, created_at desc);
create index if not exists realm_events_actor_created_idx
  on public.realm_events (actor_id, created_at desc)
  where actor_id is not null;
create index if not exists realm_events_house_created_idx
  on public.realm_events (house_slug, created_at desc)
  where house_slug is not null;

-- Idempotency. emit() is fire and forget inside after(), and a retried request
-- or a re-run of the settlement cron must not produce a second card in the
-- feed. These kinds happen exactly once per (actor, subject), so a unique index
-- lets emit() swallow the duplicate-key error instead of guarding in TS and
-- racing anyway. Kinds that legitimately repeat for the same subject over time
-- (house.overtake, for instance) are deliberately excluded.
create unique index if not exists realm_events_once_idx
  on public.realm_events (kind, subject_id, coalesce(actor_id::text, ''::text))
  where subject_id is not null
    and kind = any (array[
      'call.sealed'::text,
      'call.resolved'::text,
      'crest.earned'::text,
      'duel.opened'::text,
      'quest.completed'::text,
      'oath.sworn'::text,
      'season.milestone'::text
    ]);

-- Only realm-wide events are readable by a browser role. House, followers and
-- actor scoped events are audience decisions the database must enforce, not a
-- convenience the API applies after the fact: the anon key ships in the browser
-- bundle, so anything selectable here is public. GET /api/events applies the
-- same rule for the narrower audiences using the service-role client.
alter table public.realm_events enable row level security;

drop policy if exists "realm audience read" on public.realm_events;
create policy "realm audience read"
  on public.realm_events for select
  to public
  using (audience = 'realm'::text);

-- No write policy exists, so RLS default-denies every insert, update and delete
-- from the browser roles. Every write goes through the server routes holding
-- the service-role key. The grants below make that posture explicit rather than
-- relying on the schema default privileges.
revoke all on public.realm_events from anon, authenticated;
grant select on public.realm_events to anon, authenticated;
