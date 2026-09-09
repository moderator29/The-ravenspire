create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamp with time zone not null default now(),
  constraint message_reactions_pkey primary key (message_id, profile_id)
);

create index if not exists message_reactions_message_id_idx
  on public.message_reactions (message_id);

-- Deny by default, like messages, conversations and conversation_members: no
-- policy is added, so only the service role (every route in
-- app/api/whispers) can ever touch this table. The anon client never reads a
-- whisper's reactions directly, the same posture the messages themselves
-- already hold.
alter table public.message_reactions enable row level security;
