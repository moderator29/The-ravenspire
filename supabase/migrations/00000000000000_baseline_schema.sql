-- Ravenspire baseline schema.
--
-- Captured from the live project (ref tqvigouaifbklvajiyoj) on 2026-08-11.
--
-- WHY THIS FILE EXISTS
-- Before this, supabase/migrations/ held only 17 incremental ALTERs. Just six
-- tables had a CREATE TABLE anywhere in the repo, and not one RLS policy was in
-- version control. The database could not be rebuilt from source, and its
-- security posture could not be reviewed in a pull request. This file is the
-- reconstructed starting point; every pre-existing incremental migration is
-- dated after it and still applies cleanly on top.
--
-- Written with `if not exists` / `or replace` throughout so it is safe to run
-- against the existing production database as a no-op.
--
-- KNOWN ISSUES CAPTURED HERE DELIBERATELY (see docs/RAVENSPIRE-V2.md):
--   * posts."public read" is USING (NOT deleted) for role `public`, so the
--     posts.visibility column ('followers' | 'house' | 'mentions') is NOT
--     enforced by the database. The feed filters audience client-side in
--     lib/social/queries.ts, which is a query convenience and not a security
--     boundary. Restricted ravens are readable by anyone holding the anon key.
--     Tracked as V2 finding C1. Do not treat audience selection as private
--     until that is fixed.
--   * anon and authenticated hold full DML grants on every table (the Supabase
--     default). Writes are currently blocked only because no INSERT / UPDATE /
--     DELETE policy exists anywhere, so RLS default-denies them. That is
--     correct but fragile: adding one permissive write policy for convenience
--     would open the table completely. All writes must keep going through the
--     server routes, which hold the service-role key.
--   * TRUNCATE is granted to anon and authenticated. TRUNCATE is not subject to
--     RLS. It is not reachable through PostgREST, which exposes no TRUNCATE
--     verb, so this is latent rather than exploitable, but it should be revoked
--     as defence in depth.
--   * seasons.id is integer NOT NULL with no default. app/api/admin/seasons
--     computes max(id)+1 in JS, which is racy. Give it an identity/sequence.
--   * house_members has PRIMARY KEY (profile_id), so it can hold only the
--     member's current House. Houses V2 oath history needs that relaxed.

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  id uuid not null default gen_random_uuid(),
  privy_id text,
  handle text,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  links jsonb not null default '[]'::jsonb,
  house_slug text,
  x_handle text,
  x_followers integer,
  wallet_address text,
  renown integer not null default 0,
  tier text not null default 'smallfolk'::text,
  points integer not null default 0,
  glory integer not null default 0,
  streak integer not null default 0,
  is_admin boolean not null default false,
  is_agent boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  onboarded boolean not null default false,
  created_at timestamp with time zone not null default now(),
  is_banned boolean not null default false,
  is_verified boolean not null default false,
  streak_day date,
  constraint profiles_pkey primary key (id),
  constraint profiles_handle_key unique (handle),
  constraint profiles_privy_id_key unique (privy_id)
);

create table if not exists public.houses (
  slug text not null,
  name text not null,
  motto text not null,
  sigil text not null,
  color text not null,
  description text not null,
  member_count integer not null default 0,
  glory integer not null default 0,
  constraint houses_pkey primary key (slug)
);

create table if not exists public.house_members (
  profile_id uuid not null,
  house_slug text not null,
  role text not null default 'sworn'::text,
  joined_at timestamp with time zone not null default now(),
  constraint house_members_pkey primary key (profile_id),
  constraint house_members_house_slug_fkey foreign key (house_slug) references public.houses(slug),
  constraint house_members_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.posts (
  id uuid not null default gen_random_uuid(),
  author_id uuid not null,
  kind text not null default 'raven'::text,
  body text not null default ''::text,
  media jsonb not null default '[]'::jsonb,
  cashtags text[] not null default '{}'::text[],
  call jsonb,
  poll jsonb,
  house_slug text,
  reply_to uuid,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  repost_count integer not null default 0,
  deleted boolean not null default false,
  created_at timestamp with time zone not null default now(),
  view_count integer not null default 0,
  visibility text not null default 'public'::text,
  mentions text[] not null default '{}'::text[],
  constraint posts_pkey primary key (id),
  constraint posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade,
  constraint posts_reply_to_fkey foreign key (reply_to) references public.posts(id),
  constraint posts_visibility_check check ((visibility = any (array['public'::text, 'followers'::text, 'house'::text, 'mentions'::text])))
);

create table if not exists public.comments (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  author_id uuid not null,
  parent_id uuid,
  body text not null,
  like_count integer not null default 0,
  deleted boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint comments_pkey primary key (id),
  constraint comments_author_id_fkey foreign key (author_id) references public.profiles(id) on delete cascade,
  constraint comments_parent_id_fkey foreign key (parent_id) references public.comments(id),
  constraint comments_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade
);

create table if not exists public.follows (
  follower_id uuid not null,
  followee_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint follows_pkey primary key (follower_id, followee_id),
  constraint follows_followee_id_fkey foreign key (followee_id) references public.profiles(id) on delete cascade,
  constraint follows_follower_id_fkey foreign key (follower_id) references public.profiles(id) on delete cascade
);

create table if not exists public.reactions (
  profile_id uuid not null,
  subject_type text not null,
  subject_id uuid not null,
  kind text not null default 'like'::text,
  created_at timestamp with time zone not null default now(),
  constraint reactions_pkey primary key (profile_id, subject_type, subject_id),
  constraint reactions_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.reposts (
  profile_id uuid not null,
  post_id uuid not null,
  quote text,
  created_at timestamp with time zone not null default now(),
  constraint reposts_pkey primary key (profile_id, post_id),
  constraint reposts_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade,
  constraint reposts_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.bookmarks (
  profile_id uuid not null,
  post_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint bookmarks_pkey primary key (profile_id, post_id),
  constraint bookmarks_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade,
  constraint bookmarks_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.comment_bookmarks (
  profile_id uuid not null,
  comment_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint comment_bookmarks_pkey primary key (profile_id, comment_id),
  constraint comment_bookmarks_comment_id_fkey foreign key (comment_id) references public.comments(id) on delete cascade,
  constraint comment_bookmarks_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.post_views (
  post_id uuid not null,
  viewer_id uuid not null,
  day date not null default (now())::date,
  constraint post_views_pkey primary key (post_id, viewer_id, day),
  constraint post_views_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade,
  constraint post_views_viewer_id_fkey foreign key (viewer_id) references public.profiles(id) on delete cascade
);

create table if not exists public.poll_votes (
  post_id uuid not null,
  voter_id uuid not null,
  option_index integer not null,
  created_at timestamp with time zone not null default now(),
  constraint poll_votes_pkey primary key (post_id, voter_id),
  constraint poll_votes_post_id_fkey foreign key (post_id) references public.posts(id) on delete cascade,
  constraint poll_votes_voter_id_fkey foreign key (voter_id) references public.profiles(id) on delete cascade
);

create table if not exists public.blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint blocks_pkey primary key (blocker_id, blocked_id),
  constraint blocks_blocked_id_fkey foreign key (blocked_id) references public.profiles(id) on delete cascade,
  constraint blocks_blocker_id_fkey foreign key (blocker_id) references public.profiles(id) on delete cascade
);

create table if not exists public.mutes (
  id uuid not null default gen_random_uuid(),
  muter_id uuid not null,
  muted_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint mutes_pkey primary key (id),
  constraint mutes_muter_id_muted_id_key unique (muter_id, muted_id),
  constraint mutes_muted_id_fkey foreign key (muted_id) references public.profiles(id) on delete cascade,
  constraint mutes_muter_id_fkey foreign key (muter_id) references public.profiles(id) on delete cascade
);

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  kind text not null,
  actor_id uuid,
  subject_id uuid,
  body text,
  read boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint notifications_pkey primary key (id),
  constraint notifications_actor_id_fkey foreign key (actor_id) references public.profiles(id),
  constraint notifications_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.conversations (
  id uuid not null default gen_random_uuid(),
  kind text not null default 'dm'::text,
  title text,
  house_slug text,
  last_message_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint conversations_pkey primary key (id)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null,
  profile_id uuid not null,
  joined_at timestamp with time zone not null default now(),
  last_read_at timestamp with time zone not null default now(),
  constraint conversation_members_pkey primary key (conversation_id, profile_id),
  constraint conversation_members_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint conversation_members_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.messages (
  id uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  sender_id uuid not null,
  body text,
  created_at timestamp with time zone not null default now(),
  image_url text,
  constraint messages_pkey primary key (id),
  constraint messages_conversation_id_fkey foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete cascade,
  constraint messages_body_or_image_present check ((((body is not null) and (length(btrim(body)) > 0)) or (image_url is not null)))
);

create table if not exists public.rooms (
  id uuid not null default gen_random_uuid(),
  host_id uuid not null,
  title text not null,
  kind text not null default 'audio'::text,
  status text not null default 'scheduled'::text,
  house_slug text,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint rooms_pkey primary key (id),
  constraint rooms_host_id_fkey foreign key (host_id) references public.profiles(id) on delete cascade
);

create table if not exists public.room_participants (
  room_id uuid not null,
  profile_id uuid not null,
  role text not null default 'listener'::text,
  joined_at timestamp with time zone not null default now(),
  constraint room_participants_pkey primary key (room_id, profile_id),
  constraint room_participants_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint room_participants_room_id_fkey foreign key (room_id) references public.rooms(id) on delete cascade
);

create table if not exists public.room_messages (
  id uuid not null default gen_random_uuid(),
  room_id uuid not null,
  profile_id uuid not null,
  kind text not null default 'chat'::text,
  body text,
  created_at timestamp with time zone not null default now(),
  constraint room_messages_pkey primary key (id),
  constraint room_messages_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint room_messages_room_id_fkey foreign key (room_id) references public.rooms(id) on delete cascade
);

create table if not exists public.duels (
  id uuid not null default gen_random_uuid(),
  challenger_id uuid not null,
  opponent_id uuid,
  prompt text not null,
  challenger_entry text,
  opponent_entry text,
  status text not null default 'open'::text,
  winner_id uuid,
  ends_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint duels_pkey primary key (id),
  constraint duels_challenger_id_fkey foreign key (challenger_id) references public.profiles(id) on delete cascade,
  constraint duels_opponent_id_fkey foreign key (opponent_id) references public.profiles(id) on delete cascade,
  constraint duels_winner_id_fkey foreign key (winner_id) references public.profiles(id)
);

create table if not exists public.duel_votes (
  duel_id uuid not null,
  voter_id uuid not null,
  choice text not null,
  created_at timestamp with time zone not null default now(),
  constraint duel_votes_pkey primary key (duel_id, voter_id),
  constraint duel_votes_duel_id_fkey foreign key (duel_id) references public.duels(id) on delete cascade,
  constraint duel_votes_voter_id_fkey foreign key (voter_id) references public.profiles(id) on delete cascade,
  constraint duel_votes_choice_check check ((choice = any (array['challenger'::text, 'opponent'::text])))
);

create table if not exists public.seasons (
  id integer not null,
  name text not null,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  status text not null default 'active'::text,
  vault_raven bigint not null default 0,
  constraint seasons_pkey primary key (id)
);

create table if not exists public.season_settlements (
  id uuid not null default gen_random_uuid(),
  season_id integer not null,
  profile_id uuid not null,
  points integer not null default 0,
  renown integer not null default 0,
  glory integer not null default 0,
  rank integer not null,
  settled_at timestamp with time zone not null default now(),
  constraint season_settlements_pkey primary key (id),
  constraint season_settlements_season_id_profile_id_key unique (season_id, profile_id),
  constraint season_settlements_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint season_settlements_season_id_fkey foreign key (season_id) references public.seasons(id) on delete cascade
);

create table if not exists public.points_ledger (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  points_delta integer not null default 0,
  glory_delta integer not null default 0,
  reason text not null,
  ref uuid,
  created_at timestamp with time zone not null default now(),
  constraint points_ledger_pkey primary key (id),
  constraint points_ledger_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.user_crests (
  profile_id uuid not null,
  crest_slug text not null,
  earned_at timestamp with time zone not null default now(),
  constraint user_crests_pkey primary key (profile_id, crest_slug),
  constraint user_crests_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.user_quests (
  profile_id uuid not null,
  quest_slug text not null,
  period text not null,
  completed_at timestamp with time zone not null default now(),
  constraint user_quests_pkey primary key (profile_id, quest_slug, period),
  constraint user_quests_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.war_state (
  profile_id uuid not null,
  unlocked_champions text[] not null default '{aeron-the-black,ser-willas,mira-stormborn}'::text[],
  gold integer not null default 200,
  war_glory integer not null default 0,
  battles integer not null default 0,
  wins integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  last_daily date,
  chests integer not null default 1,
  mastery jsonb not null default '{}'::jsonb,
  constraint war_state_pkey primary key (profile_id),
  constraint war_state_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.war_battles (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  champion_slug text,
  battlefield text,
  result text,
  glory_earned integer not null default 0,
  kills integer not null default 0,
  duration_s integer not null default 0,
  created_at timestamp with time zone not null default now(),
  seed bigint,
  started_at timestamp with time zone default now(),
  settled boolean not null default true,
  constraint war_battles_pkey primary key (id),
  constraint war_battles_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade
);

create table if not exists public.referral_codes (
  code text not null,
  owner_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint referral_codes_pkey primary key (code),
  constraint referral_codes_owner_id_key unique (owner_id),
  constraint referral_codes_owner_id_fkey foreign key (owner_id) references public.profiles(id) on delete cascade
);

create table if not exists public.referrals (
  profile_id uuid not null,
  referrer_id uuid not null,
  activated boolean not null default false,
  created_at timestamp with time zone not null default now(),
  joined boolean not null default true,
  constraint referrals_pkey primary key (profile_id),
  constraint referrals_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint referrals_referrer_id_fkey foreign key (referrer_id) references public.profiles(id) on delete cascade
);

create table if not exists public.tips (
  id uuid not null default gen_random_uuid(),
  from_id uuid not null,
  to_id uuid not null,
  points integer,
  subject_type text,
  subject_id uuid,
  created_at timestamp with time zone not null default now(),
  amount text,
  token text,
  tx_hash text,
  chain_id integer,
  constraint tips_pkey primary key (id),
  constraint tips_from_id_fkey foreign key (from_id) references public.profiles(id) on delete cascade,
  constraint tips_to_id_fkey foreign key (to_id) references public.profiles(id) on delete cascade
);

create table if not exists public.trades (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  kind text not null,
  chain_id integer not null,
  tx_hash text not null,
  sell_symbol text,
  sell_amount text,
  sell_contract text,
  buy_symbol text,
  buy_amount text,
  buy_contract text,
  usd_value numeric,
  created_at timestamp with time zone not null default now(),
  constraint trades_pkey primary key (id),
  constraint trades_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint trades_kind_check check ((kind = any (array['buy'::text, 'sell'::text, 'swap'::text])))
);

create table if not exists public.reports (
  id uuid not null default gen_random_uuid(),
  reporter_id uuid,
  subject_type text not null,
  subject_id uuid not null,
  reason text not null,
  status text not null default 'open'::text,
  created_at timestamp with time zone not null default now(),
  resolved_by uuid,
  resolved_at timestamp with time zone,
  resolution_note text,
  constraint reports_pkey primary key (id),
  constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles(id),
  constraint reports_resolved_by_fkey foreign key (resolved_by) references public.profiles(id)
);

create table if not exists public.feature_flags (
  key text not null,
  enabled boolean not null default false,
  note text,
  constraint feature_flags_pkey primary key (key)
);

create table if not exists public.admin_audit_log (
  id uuid not null default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint admin_audit_log_pkey primary key (id),
  constraint admin_audit_log_actor_id_fkey foreign key (actor_id) references public.profiles(id)
);

create table if not exists public.rate_limits (
  key text not null,
  count integer not null default 0,
  window_start timestamp with time zone not null default now(),
  constraint rate_limits_pkey primary key (key)
);

-- ============================================================
-- INDEXES
-- ============================================================

create unique index if not exists profiles_handle_lower on public.profiles using btree (lower(handle));
create index if not exists posts_author_idx on public.posts using btree (author_id, created_at desc);
create index if not exists posts_created_idx on public.posts using btree (created_at desc);
create index if not exists posts_house_idx on public.posts using btree (house_slug, created_at desc);
create index if not exists posts_kind_idx on public.posts using btree (kind, created_at desc);
create index if not exists posts_mentions_gin on public.posts using gin (mentions);
create index if not exists comments_post_idx on public.comments using btree (post_id, created_at);
create index if not exists reactions_subject_idx on public.reactions using btree (subject_type, subject_id);
create index if not exists notifications_profile_created_idx on public.notifications using btree (profile_id, created_at desc);
create index if not exists notifications_profile_idx on public.notifications using btree (profile_id, read, created_at desc);
create index if not exists notifications_unread_idx on public.notifications using btree (profile_id) where (read = false);
create index if not exists conv_members_profile_idx on public.conversation_members using btree (profile_id);
create index if not exists messages_conv_idx on public.messages using btree (conversation_id, created_at);
create index if not exists messages_conversation_created_idx on public.messages using btree (conversation_id, created_at);
create index if not exists mutes_muter_id_idx on public.mutes using btree (muter_id);
create index if not exists comment_bookmarks_comment_idx on public.comment_bookmarks using btree (comment_id);
create index if not exists points_profile_idx on public.points_ledger using btree (profile_id, created_at desc);
create index if not exists room_messages_room_time_idx on public.room_messages using btree (room_id, created_at);
create index if not exists rooms_status_idx on public.rooms using btree (status, created_at desc);
create index if not exists season_settlements_season_idx on public.season_settlements using btree (season_id, rank);
create unique index if not exists tips_tx_hash_key on public.tips using btree (tx_hash) where (tx_hash is not null);
create index if not exists trades_created_at_idx on public.trades using btree (created_at desc);
create index if not exists trades_profile_id_idx on public.trades using btree (profile_id);
create unique index if not exists trades_tx_hash_key on public.trades using btree (tx_hash);
create index if not exists war_battles_profile_created_idx on public.war_battles using btree (profile_id, created_at desc);
create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log using btree (created_at desc);

-- ============================================================
-- FUNCTIONS
--
-- All three are SECURITY DEFINER and are called only from server-only code
-- holding the service-role key. Their EXECUTE grants are locked down in
-- 20260811090000_revoke_public_execute_on_economy_rpcs.sql; do not re-grant
-- them to anon or authenticated.
-- ============================================================

create or replace function public.increment_profile_totals(p_profile_id uuid, p_points integer, p_glory integer)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_house text;
begin
  update public.profiles
     set points = points + p_points,
         glory = glory + p_glory,
         renown = renown + p_points + p_glory,
         tier = case
           when renown + p_points + p_glory >= 15000 then 'king'
           when renown + p_points + p_glory >= 7000 then 'hand'
           when renown + p_points + p_glory >= 3000 then 'warden'
           when renown + p_points + p_glory >= 1200 then 'lord'
           when renown + p_points + p_glory >= 400 then 'knight'
           when renown + p_points + p_glory >= 100 then 'squire'
           else 'smallfolk'
         end
   where id = p_profile_id
   returning house_slug into v_house;
  return v_house;
end;
$function$;

create or replace function public.increment_house_glory(p_slug text, p_glory integer)
returns void language sql security definer set search_path to 'public' as $function$
  update public.houses set glory = glory + p_glory where slug = p_slug;
$function$;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v_count integer;
begin
  insert into public.rate_limits (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then 1 else public.rate_limits.count + 1 end,
        window_start = case
          when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          then now() else public.rate_limits.window_start end
  returning count into v_count;
  return v_count;
end;
$function$;

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Every table has RLS enabled. Only SELECT policies exist anywhere: there is
-- no INSERT, UPDATE or DELETE policy in the entire schema, so all writes are
-- default-denied for anon and authenticated and must go through the server
-- routes, which use the service-role key. Tables with RLS on and no policy at
-- all (points_ledger, notifications, tips, reports, war_state, war_battles,
-- messages, conversations, conversation_members, blocks, post_views,
-- referrals, referral_codes, user_quests, room_messages, rate_limits,
-- admin_audit_log) are therefore service-role only by design.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.houses enable row level security;
alter table public.house_members enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.reactions enable row level security;
alter table public.reposts enable row level security;
alter table public.bookmarks enable row level security;
alter table public.comment_bookmarks enable row level security;
alter table public.post_views enable row level security;
alter table public.poll_votes enable row level security;
alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_messages enable row level security;
alter table public.duels enable row level security;
alter table public.duel_votes enable row level security;
alter table public.seasons enable row level security;
alter table public.season_settlements enable row level security;
alter table public.points_ledger enable row level security;
alter table public.user_crests enable row level security;
alter table public.user_quests enable row level security;
alter table public.war_state enable row level security;
alter table public.war_battles enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.tips enable row level security;
alter table public.trades enable row level security;
alter table public.reports enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.rate_limits enable row level security;

do $$
begin
  -- Public-readable reference and social data.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='public read')
    then create policy "public read" on public.profiles for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='houses' and policyname='public read')
    then create policy "public read" on public.houses for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='house_members' and policyname='public read')
    then create policy "public read" on public.house_members for select to public using (true); end if;
  -- NOTE (V2 finding C1): this does NOT honour posts.visibility.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='public read')
    then create policy "public read" on public.posts for select to public using ((not deleted)); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comments' and policyname='public read')
    then create policy "public read" on public.comments for select to public using ((not deleted)); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='follows' and policyname='public read')
    then create policy "public read" on public.follows for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reactions' and policyname='public read')
    then create policy "public read" on public.reactions for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reposts' and policyname='public read')
    then create policy "public read" on public.reposts for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='poll_votes' and policyname='public read')
    then create policy "public read" on public.poll_votes for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rooms' and policyname='public read')
    then create policy "public read" on public.rooms for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='room_participants' and policyname='public read')
    then create policy "public read" on public.room_participants for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='duels' and policyname='public read')
    then create policy "public read" on public.duels for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='duel_votes' and policyname='public read')
    then create policy "public read" on public.duel_votes for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='seasons' and policyname='public read')
    then create policy "public read" on public.seasons for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_crests' and policyname='public read')
    then create policy "public read" on public.user_crests for select to public using (true); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='feature_flags' and policyname='public read')
    then create policy "public read" on public.feature_flags for select to public using (true); end if;

  -- Owner-private shelves: readable only through the server routes.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bookmarks' and policyname='own bookmarks')
    then create policy "own bookmarks" on public.bookmarks for select to public using (false); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comment_bookmarks' and policyname='own comment bookmarks')
    then create policy "own comment bookmarks" on public.comment_bookmarks for select to public using (false); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mutes' and policyname='own mutes')
    then create policy "own mutes" on public.mutes for select to public using (false); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications owner only')
    then create policy "notifications owner only" on public.notifications for select to public using (false); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trades' and policyname='trades no direct client access')
    then create policy "trades no direct client access" on public.trades for select to public using (false); end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='season_settlements' and policyname='season_settlements no direct client access')
    then create policy "season_settlements no direct client access" on public.season_settlements for select to public using (false); end if;
end $$;

-- ============================================================
-- COLUMN GRANTS
--
-- profiles is publicly readable, so sensitive columns are withheld at the
-- column level rather than the row level: anon and authenticated get no
-- table-wide SELECT on profiles, only the named columns below.
-- ============================================================

revoke select on public.profiles from anon, authenticated;
grant select (
  id, handle, display_name, avatar_url, banner_url, bio, links, house_slug,
  x_handle, x_followers, renown, tier, points, glory, streak, is_agent,
  onboarded, created_at, is_verified
) on public.profiles to anon, authenticated;

-- Defence in depth: TRUNCATE is not subject to RLS and is never needed by the
-- public roles. PostgREST exposes no TRUNCATE verb, so this is latent rather
-- than exploitable, but there is no reason to keep the grant.
revoke truncate on all tables in schema public from anon, authenticated;
