-- Live-room chat. Written and read only through the service-role server routes
-- (RLS on, no public policies), mirroring the whispers messages table. Realtime
-- delivery is done by explicit service-role broadcast, not table replication.
create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'chat',
  body text,
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_time_idx
  on public.room_messages (room_id, created_at);

alter table public.room_messages enable row level security;
