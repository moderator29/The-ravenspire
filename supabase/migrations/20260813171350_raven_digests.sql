-- The Herald's digest: one stored paragraph per member, plus its window.
--
-- WHY A TABLE AT ALL
-- The digest is the only Herald surface nobody asks for. It is computed when a
-- member opens the Ravenry, which is the most requested path in the product, so
-- the row is the thing that stops a page view becoming a model call. Three
-- separate jobs, and each one needs the row rather than a cache in front of it:
--
--   1. Spend. generated_at is the freshness check. Inside the TTL the route
--      returns the stored paragraph and spends nothing, so a member refreshing
--      the feed twenty times costs one call, not twenty.
--   2. The window. window_start is what "since you were last here" actually
--      means. Each digest begins where the previous one ended, so two digests
--      never narrate the same hour, and a window that produced nothing worth
--      saying is carried forward rather than thrown away (see NULL TEXT).
--   3. Dismissal. The design law says a system card carries a primary action or
--      a dismiss. Dismissal has to outlive a page load or the card returns on
--      the next render, so it is a column and not component state.
--
-- ONE ROW PER MEMBER
-- The primary key is the profile, not a generated id. A member has exactly one
-- current digest; a new one replaces it. There is no history here on purpose:
-- the realm event spine is the history, and a table of every paragraph the
-- Herald ever wrote would be a second, weaker copy of it.
--
-- NULL TEXT
-- text is nullable and a NULL means "the Herald had nothing worth saying for
-- this window", which is a real and common answer in a young realm. It is
-- written without a model call ever being made, and it keeps window_start where
-- it was so a realm producing one act a day accumulates into a digest instead
-- of having each quiet window discarded. A row with NULL text renders nothing
-- at all. It is never a placeholder for prose that failed to arrive: a failed
-- or unavailable model writes no row, so the next request tries again.
--
-- FACTS
-- The exact lines the model was handed, stored beside the paragraph it wrote.
-- Every figure in a digest is computed by the server, so this is the audit
-- trail for any sentence a member disputes, and it is the difference between
-- "the Herald said 40" and "the realm counted 40 and the Herald read it out".
--
-- RLS
-- Deny by default to every browser role, the same posture as raven_messages and
-- for the same architectural reason: this stack authenticates with Privy, so
-- auth.uid() is always null and an owner policy written against it would match
-- nothing and protect nothing. Ownership is enforced in the route, which
-- resolves the member from a verified Privy token and reads with the service
-- role. The policy below is the floor under that: wired to a browser client by
-- mistake, this table reads nothing rather than reading everyone.
--
-- No function is added here, so there is nothing to revoke from public, anon or
-- authenticated.

create table if not exists public.raven_digests (
  profile_id uuid not null,
  -- NULL means the window held nothing worth telling. See NULL TEXT above.
  text text,
  -- The instant this digest's window opens. Everything narrated happened at or
  -- after it.
  window_start timestamptz not null,
  generated_at timestamptz not null default now(),
  -- The server-computed lines the paragraph was written from.
  facts jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  constraint raven_digests_pkey primary key (profile_id),
  constraint raven_digests_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  -- The Herald is asked for two or three sentences. Anything near this ceiling
  -- is a prompt that has stopped working, not a long digest.
  constraint raven_digests_text_len
    check (text is null or char_length(text) <= 2000),
  -- A window that ends before it starts would make "since you were last here"
  -- meaningless, and every reader of this table trusts that ordering.
  constraint raven_digests_window_order check (window_start <= generated_at)
);

alter table public.raven_digests enable row level security;

drop policy if exists "raven digests owner only" on public.raven_digests;
create policy "raven digests owner only"
  on public.raven_digests for select using (false);

-- Sealed until it is real. Idempotent, and never re-seals a flag an operator
-- has since flipped: on conflict the row is left exactly as it is.
insert into public.realm_flags (key, enabled)
values ('herald_digest_live', false)
on conflict (key) do nothing;
