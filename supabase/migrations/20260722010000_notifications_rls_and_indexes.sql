-- Notifications privacy + read-path indexes.
--
-- The notifications table is a private, per-owner table. It already has RLS
-- enabled; this formalizes the posture in version control the same way
-- public.mutes does: a single deny-by-default SELECT policy so no browser role
-- (anon or authenticated) can read another member's ravens directly. Every read
-- flows through the authenticated /api/notifications routes, which scope by the
-- caller's profile id and use the service-role admin client (bypasses RLS).
--
-- Realtime is delivered over the per-member broadcast channel notifs:user:{id}
-- (see lib/notifications.ts), mirroring the whispers pattern, so live delivery
-- does not depend on table replication or an owner-read RLS policy. This stack
-- authenticates members with Privy rather than Supabase Auth, so an auth.uid()
-- based owner policy would never match on the anon realtime connection; the
-- broadcast channel is the correct, working filter for this architecture.

alter table public.notifications enable row level security;

drop policy if exists "notifications owner only" on public.notifications;
create policy "notifications owner only"
  on public.notifications for select using (false);

-- Unread badge poll: count and newest-unread lookups are scoped to a member and
-- filtered to unread. A partial index keeps that hot path cheap as volume grows.
create index if not exists notifications_unread_idx
  on public.notifications (profile_id)
  where read = false;

-- Notifications center list: newest-first per member.
create index if not exists notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc);
