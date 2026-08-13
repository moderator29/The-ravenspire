-- Provably fair chest opening, and an opening that cannot half happen.
--
-- WHY
-- Two things were missing from the chest, and the second one is the reason the
-- first one matters.
--
-- 1. THE COMMITMENT CAME TOO LATE. The plan for the opening was to generate a
--    server seed at open time and store its hash. That is the version of
--    "provably fair" that proves nothing: a server which picks its seed after
--    the member has committed can roll a thousand seeds and publish the hash
--    of whichever one paid out least, and every published hash still verifies.
--    The commitment has to exist before the member can act on it. So the seed
--    is generated and committed when a member first looks at the chests, kept
--    in chest_seeds, and revealed only when they rotate it. By the time an
--    opening happens the hash is already in the member's hands and the seed
--    behind it cannot change.
--
-- 2. THE OPENING WAS FOUR WRITES. Consume the entitlement, record the opening,
--    grant the cards, link the two. Four round trips from a serverless route,
--    and a crash between any two of them either eats a paid chest and grants
--    nothing, or grants the cards and leaves the entitlement unspent to be
--    opened again. Both are unrecoverable from the outside, because there is
--    no way to tell one from the other afterwards. public.chest_open does all
--    four in one transaction, under a row lock, or does none of them.
--
-- THE THREE INPUTS to a roll, and what each is for:
--   server seed   committed as a hash beforehand. Stops the member predicting.
--   client seed   the member's own text. Stops the server choosing, because it
--                 cannot know this in advance.
--   nonce         the entitlement being spent, a uuid, unique to one opening.
--                 Fixed before the roll rather than counted during it, so a
--                 retried open recomputes the same cards rather than rerolling
--                 into a better chest.
--
-- The roll itself is application code (lib/collectibles/pulls.ts) because the
-- card catalog is code: it derives from the champion roster, the single source
-- of truth, and duplicating forty cards into the database so a plpgsql
-- function could shuffle them would be creating a second roster to disagree
-- with the first. So the route rolls and this function settles, and the
-- function is what makes the settling indivisible.
--
-- Nothing here opens anything today. chests_live is off, no entitlement exists
-- because nothing sells chests yet, and the route refuses on both counts.

-- ------------------------------------------------------------------
-- 1. The commitment.
-- ------------------------------------------------------------------

create table if not exists public.chest_seeds (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  -- The seed itself. Secret while the commitment is active; published the
  -- moment it is rotated, which is what makes every opening under it
  -- checkable. Never leaves the server before then, and never appears in a
  -- response, a log or an error.
  seed text not null,
  -- sha256(seed), published immediately. This is the promise.
  seed_hash text not null,
  -- The member's own text, mixed into every roll under this commitment. They
  -- choose it, and changing it is a rotation, because a client seed changed
  -- mid-commitment would let a member re-roll a chest they had already seen.
  client_seed text not null default '',
  -- Exactly one active commitment per member, enforced by the partial unique
  -- index below. Retiring one reveals its seed.
  active boolean not null default true,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chest_seeds_pkey primary key (id),
  constraint chest_seeds_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint chest_seeds_seed_check check (seed <> ''::text),
  constraint chest_seeds_seed_hash_check check (seed_hash ~ '^[0-9a-f]{64}$'),
  constraint chest_seeds_client_seed_check check (char_length(client_seed) <= 64),
  -- A retired commitment is a revealed one. The pair moves together or the
  -- reveal is a promise nobody kept.
  constraint chest_seeds_revealed_pair_check
    check (active = (revealed_at is null))
);

create unique index if not exists chest_seeds_active_idx
  on public.chest_seeds (profile_id)
  where active;

-- The member's own history of commitments, newest first, which is what the
-- verifier page lists.
create index if not exists chest_seeds_profile_created_idx
  on public.chest_seeds (profile_id, created_at desc);

alter table public.chest_seeds enable row level security;

-- Deny by default, and here it is not merely convention: the seed column is a
-- secret until its commitment is retired, and a browser readable row would
-- hand every member the ability to predict their own chests. Everything goes
-- through /api/chests/seed, which returns the hash and never the live seed.
drop policy if exists "chest seeds owner only" on public.chest_seeds;
create policy "chest seeds owner only"
  on public.chest_seeds for select using (false);

revoke all on public.chest_seeds from anon, authenticated;

-- ------------------------------------------------------------------
-- 2. The opening record.
-- ------------------------------------------------------------------

-- The nonce is the entitlement being spent, which is a uuid. The integer
-- `nonce` column the commerce engine added anticipated a counter, and a
-- counter is the worse design: it has to be read and incremented inside the
-- roll, which is one more thing to get wrong under concurrency, and it lets a
-- retried open land on a different number and therefore a different chest.
-- Nothing has ever written it (the table is empty and the opening route is a
-- skeleton), so it is replaced rather than left to confuse the next reader.
alter table public.chest_openings
  add column if not exists entitlement_id uuid;

alter table public.chest_openings
  drop column if exists nonce;

alter table public.chest_openings
  drop constraint if exists chest_openings_entitlement_id_fkey;
alter table public.chest_openings
  add constraint chest_openings_entitlement_id_fkey
  foreign key (entitlement_id) references public.chest_entitlements (id)
  on delete set null;

-- One entitlement opens once. The unique index is the last line of defence
-- under the row lock in chest_open: even a bug that skipped the lock could not
-- write two openings for one paid chest.
create unique index if not exists chest_openings_entitlement_idx
  on public.chest_openings (entitlement_id)
  where entitlement_id is not null;

-- ------------------------------------------------------------------
-- 3. The opening, atomically.
-- ------------------------------------------------------------------
--
-- Takes the rolled cards rather than rolling them, and settles everything the
-- roll implies in one transaction: the entitlement is spent, the opening is
-- recorded with its proof, the cards land in the holdings ledger, and the
-- entitlement points at the opening that consumed it.
--
-- Returns the opening id, or null when the entitlement is already spent or is
-- not this member's. Null is not an error: it is the honest answer to a
-- double submit, and the route reads back the original opening rather than
-- rolling a second one.
--
-- EXECUTE is granted to service_role ONLY. Supabase exposes every public
-- function over PostgREST at /rest/v1/rpc/<name> and the anon key ships in the
-- browser bundle, so a public grant here would let anyone grant themselves
-- cards. See 20260811090000_revoke_public_execute_on_economy_rpcs.sql for the
-- incident this rule comes from.

create or replace function public.chest_open(
  p_profile_id uuid,
  p_entitlement_id uuid,
  p_server_seed_hash text,
  p_client_seed text,
  p_result jsonb,
  p_cards jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.chest_entitlements%rowtype;
  v_opening_id uuid;
  v_card jsonb;
begin
  -- Lock the entitlement for the length of the transaction. Two opens racing
  -- on the same chest serialise here, and the second finds it spent.
  select * into v_entitlement
    from public.chest_entitlements
   where id = p_entitlement_id
     and profile_id = p_profile_id
     and opened_at is null
   for update;

  if not found then
    return null;
  end if;

  insert into public.chest_openings (
    profile_id, chest_sku, result, server_seed_hash, client_seed, entitlement_id
  )
  values (
    p_profile_id,
    v_entitlement.chest_sku,
    p_result,
    p_server_seed_hash,
    p_client_seed,
    p_entitlement_id
  )
  returning id into v_opening_id;

  -- The cards, one row per copy, exactly as the holdings ledger stores them.
  -- source_id points back at the opening, so every card in the realm can name
  -- the chest it came out of.
  for v_card in select * from jsonb_array_elements(p_cards)
  loop
    insert into public.inventory (
      profile_id, set_slug, card_number, champion_slug, rarity, source, source_id
    )
    values (
      p_profile_id,
      v_card ->> 'set_slug',
      (v_card ->> 'card_number')::integer,
      v_card ->> 'champion_slug',
      v_card ->> 'rarity',
      'chest_opening',
      v_opening_id
    );
  end loop;

  update public.chest_entitlements
     set opened_at = now(),
         opening_id = v_opening_id
   where id = p_entitlement_id;

  return v_opening_id;
end;
$$;

revoke all on function public.chest_open(uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.chest_open(uuid, uuid, text, text, jsonb, jsonb)
  to service_role;
