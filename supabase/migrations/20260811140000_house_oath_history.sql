-- Houses V2, part 1: house_members becomes the oath ledger.
--
-- WHY
-- house_members was written once at onboarding and never read anywhere. Its
-- primary key was (profile_id) alone, so it could hold only a member's current
-- House and no history at all. Section 11.1 of docs/RAVENSPIRE-V2.md needs the
-- opposite: a permanent, public record of every oath a member has sworn, with
-- the season each oath opened and closed, so a Keep can honestly read
-- "House Emberfall (Season 1 to 3), House Corvane (Season 4 to present)".
--
-- The key is relaxed to a surrogate id and a partial unique index keeps the
-- invariant that actually matters: at most one OPEN oath per member. Closed
-- oaths accumulate underneath it forever.
--
-- Contributions are not stored here. They stay in points_ledger and are
-- attributed to a House by joining a ledger row's created_at against the oath
-- window that contained it (see the next migration). That is what makes
-- "contributions stay with the House that earned them, permanently" true by
-- construction rather than by a transfer routine that could be got wrong.

-- ------------------------------------------------------------------
-- 1. A surrogate key, so one member can hold many oath rows.
-- ------------------------------------------------------------------

alter table public.house_members
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.house_members
  drop constraint if exists house_members_pkey;

alter table public.house_members
  add constraint house_members_pkey primary key (id);

-- ------------------------------------------------------------------
-- 2. The oath window.
-- ------------------------------------------------------------------

alter table public.house_members
  add column if not exists sworn_at timestamptz not null default now(),
  add column if not exists left_at timestamptz,
  add column if not exists season_id integer,
  add column if not exists left_season_id integer;

alter table public.house_members
  drop constraint if exists house_members_season_id_fkey;
alter table public.house_members
  add constraint house_members_season_id_fkey
  foreign key (season_id) references public.seasons (id) on delete set null;

alter table public.house_members
  drop constraint if exists house_members_left_season_id_fkey;
alter table public.house_members
  add constraint house_members_left_season_id_fkey
  foreign key (left_season_id) references public.seasons (id) on delete set null;

alter table public.house_members
  drop constraint if exists house_members_window_check;
alter table public.house_members
  add constraint house_members_window_check
  check (left_at is null or left_at >= sworn_at);

-- Leadership is computed each season (section 11.2), never elected, so the set
-- of roles is closed and can be constrained.
alter table public.house_members
  drop constraint if exists house_members_role_check;
alter table public.house_members
  add constraint house_members_role_check
  check (role in (
    'sworn',
    'lord',
    'hand',
    'master-of-ravens',
    'master-of-war',
    'chronicler',
    'recruiter'
  ));

-- ------------------------------------------------------------------
-- 3. Backfill the founding oaths.
-- ------------------------------------------------------------------

-- The onboarding upsert only ever wrote joined_at. sworn_at defaulted to now()
-- when the column was added, which would date every founding oath to this
-- migration; carry the real timestamp across.
update public.house_members
   set sworn_at = joined_at
 where sworn_at is distinct from joined_at;

-- The season that contained each oath.
update public.house_members hm
   set season_id = s.id
  from public.seasons s
 where hm.season_id is null
   and hm.sworn_at >= s.starts_at
   and hm.sworn_at < s.ends_at;

-- An oath sworn before the first season opened belongs to the first season.
update public.house_members hm
   set season_id = (select min(id) from public.seasons)
 where hm.season_id is null
   and exists (select 1 from public.seasons);

-- ------------------------------------------------------------------
-- 4. Indexes and the one-open-oath invariant.
-- ------------------------------------------------------------------

create unique index if not exists house_members_current_oath_idx
  on public.house_members (profile_id)
  where left_at is null;

create index if not exists house_members_house_current_idx
  on public.house_members (house_slug)
  where left_at is null;

create index if not exists house_members_profile_history_idx
  on public.house_members (profile_id, sworn_at);

-- The contribution attribution join in the next migration walks the ledger by
-- profile and time; without this it is a sequential scan per House.
create index if not exists points_ledger_profile_created_idx
  on public.points_ledger (profile_id, created_at);

create index if not exists points_ledger_ref_idx
  on public.points_ledger (ref)
  where ref is not null;

-- ------------------------------------------------------------------
-- 5. Legacy crests.
-- ------------------------------------------------------------------
--
-- A House-specific crest is not revoked when a member swears a new oath, it
-- becomes Legacy: still held, still shown, no longer live, and unearnable
-- again unless the member returns to that House. Marking it needs to know
-- which House granted it, which user_crests did not record.

alter table public.user_crests
  add column if not exists house_slug text,
  add column if not exists legacy boolean not null default false;

alter table public.user_crests
  drop constraint if exists user_crests_house_slug_fkey;
alter table public.user_crests
  add constraint user_crests_house_slug_fkey
  foreign key (house_slug) references public.houses (slug) on delete set null;

create index if not exists user_crests_house_idx
  on public.user_crests (house_slug)
  where house_slug is not null;
