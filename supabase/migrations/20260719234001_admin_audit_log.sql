-- Admin audit trail: every privileged write records who acted, on what, and
-- with what payload. RLS is enabled with no policies so only the service role
-- (which bypasses RLS) can read or write it; the anon/authenticated keys never
-- see the trail.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
