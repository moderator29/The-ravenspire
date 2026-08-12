-- Server-persisted Herald conversations.
--
-- WHY
-- /api/raven is stateless and the entire history lives in localStorage under
-- raven_conversations. A member who clears their browser loses every
-- conversation they have ever had with the Herald, and a member who opens the
-- realm on a second device is met with an empty drawer. It is the last part of
-- the Herald that is not real.
--
-- SHAPE
-- Two tables rather than one row of jsonb per conversation. A conversation is
-- appended to on every single send, and rewriting a whole jsonb blob to add one
-- message means the write cost grows with the length of the conversation, which
-- is exactly backwards. Separate rows also let the cap be enforced with a
-- delete rather than by rewriting a document.
--
-- ORDERING
-- raven_messages carries an explicit seq rather than ordering on created_at.
-- One send writes the member's message and the Herald's reply together, and
-- two rows written inside the same millisecond tie on a timestamp. A tie makes
-- the order of a conversation undefined, which shows up as a reply appearing
-- above the question it answers. seq is assigned by the server, is unique per
-- conversation, and makes the order total.
--
-- OWNERSHIP
-- profile_id is denormalised onto raven_messages. Every ownership check and the
-- per-member cap would otherwise need a join back to the conversation, on the
-- hottest path the Herald has.
--
-- RLS
-- Deny by default to every browser role, the same posture as public.mutes and
-- public.notifications, and for the same architectural reason: this stack
-- authenticates with Privy, so auth.uid() is always null and an owner policy
-- written against it would match nothing and protect nothing. Ownership is
-- enforced in the routes, which resolve the member from a verified Privy token
-- and read with the service role. The policies below are the floor under that:
-- if a route is ever wired to a browser client by mistake, it reads nothing
-- rather than reading everyone.

create table if not exists public.raven_conversations (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  title text not null default 'New chat'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raven_conversations_pkey primary key (id),
  constraint raven_conversations_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint raven_conversations_title_len check (char_length(title) <= 120)
);

create table if not exists public.raven_messages (
  id uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  -- Denormalised owner. See OWNERSHIP above.
  profile_id uuid not null,
  role text not null,
  content text not null default ''::text,
  -- The non-text parts of a Msg: token cards, a wallet card, a realm pulse,
  -- suggestions, sources and the browse flags. One versioned document, because
  -- a card shape belongs to the Herald surface and must not become a migration
  -- every time that surface gains a field.
  meta jsonb not null default '{}'::jsonb,
  -- Position in the conversation. Assigned by the server, never by the client.
  seq integer not null,
  created_at timestamptz not null default now(),
  constraint raven_messages_pkey primary key (id),
  constraint raven_messages_conversation_id_fkey
    foreign key (conversation_id) references public.raven_conversations (id)
      on delete cascade,
  constraint raven_messages_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint raven_messages_role_check
    check (role = any (array['user'::text, 'assistant'::text, 'error'::text])),
  -- A chat message beyond this is not a chat message. The routes reject rather
  -- than truncate, because silently storing a shortened copy of what a member
  -- said would misrepresent the record.
  constraint raven_messages_content_len check (char_length(content) <= 16000),
  constraint raven_messages_seq_positive check (seq >= 0),
  -- Ordering is total per conversation, and a concurrent double append cannot
  -- produce two messages claiming the same position.
  constraint raven_messages_conversation_seq_key unique (conversation_id, seq)
);

-- The drawer's list: a member's conversations, most recently touched first.
create index if not exists raven_conversations_profile_updated_idx
  on public.raven_conversations (profile_id, updated_at desc);

-- Reading one conversation, in order.
create index if not exists raven_messages_conversation_seq_idx
  on public.raven_messages (conversation_id, seq);

alter table public.raven_conversations enable row level security;
alter table public.raven_messages enable row level security;

drop policy if exists "raven conversations owner only" on public.raven_conversations;
create policy "raven conversations owner only"
  on public.raven_conversations for select using (false);

drop policy if exists "raven messages owner only" on public.raven_messages;
create policy "raven messages owner only"
  on public.raven_messages for select using (false);
