-- GASLESS AND FORGIVING, the cost of being non-custodial (mission 11).
--
-- WHY THIS EXISTS
-- Rule 6 is the whole mission: every value transfer is signed by the member's
-- own Privy embedded wallet and the platform never takes custody. The bill for
-- that arrives on the member's first act, when a realm that has so far cost
-- them nothing asks them to hold ETH on Base before they can carry a card they
-- already own. That is where new members are lost, and it is not a copy problem.
--
-- Three things land here, and they are three DIFFERENT things that a lazier
-- reading would have merged:
--
--   1. A SPONSORSHIP BUDGET, counted in acts, so the realm can pay a member's
--      gas without one afternoon draining a free tier and turning into an
--      invoice nobody agreed to (rule 19).
--   2. A MEMBER SET CEILING on the value of any transaction the realm's own
--      surfaces build and ask a member to sign. In wei, and it binds the realm,
--      not the member's keys. See the long note in section 3 for why those are
--      not the same sentence.
--   3. Neither of these is the commerce cap in member_commerce_limits, and
--      section 3 says why at length, because shipping two features under one
--      name is worse than shipping one.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No paymaster URL, no bundler URL, no provider key. Not because they are
-- founder-only (they are), but because THEY NEVER PASS THROUGH THIS CODEBASE.
-- Privy resolves a smart wallet's bundler and paymaster from configuration held
-- in its own dashboard and delivers it to the browser inside the app config;
-- the only knob the SDK exposes to application code is `paymasterContext`. So
-- there is no column, no environment variable and no function here that could
-- hold one. What the realm owns is the POLICY, and the policy is all that is
-- below. See docs/RAVENSPIRE-V2.md section 50.
--
-- WHY THE BUDGET IS COUNTED IN ACTS AND NOT IN DOLLARS
-- Pricing gas in fiat needs an ETH price, which needs an oracle, which is a new
-- dependency bought to make a budget marginally more precise. Worse, it puts a
-- float in the middle of a spending limit, and this codebase does not do that
-- (lib/commerce/money.ts). An act is an integer, it cannot drift, and the
-- conversion is a one-time sum the founder does once against whatever the
-- paymaster's free tier actually is. A realm allowance of 1,200 sponsored acts
-- a month against a $15 free tier is a sentence anybody can check.
--
-- READ BEFORE ALTERING, per supabase/migrations/README.md. This migration
-- alters NOTHING that already exists. Two new tables, one new flag row, five
-- new functions. member_commerce_limits is read by nothing here and changed by
-- nothing here, on purpose.
--
-- RLS, per the standing posture: this stack authenticates with Privy, so
-- auth.uid() is always null and an owner policy written against it would match
-- nothing and protect nothing. Both new tables are deny by default with grants
-- revoked and no policy, and ownership is enforced in the routes under the
-- service role. Every function is revoked from public, anon and authenticated
-- and granted to service_role alone, because Supabase publishes every public
-- function at /rest/v1/rpc/<name> and the anon key ships in the browser bundle.
-- See 20260811090000_revoke_public_execute_on_economy_rpcs.sql for the incident
-- that rule comes from.

-- ============================================================
-- 1. The launch switch
-- ============================================================
--
-- A fifth chapter switch beside reliquary_live, chests_live, mercer_live and
-- mint_live. Off, and it stays off until a paymaster genuinely exists behind
-- the Privy dashboard. Never re-seals a flag an operator has since flipped.
--
-- The flag alone is not enough to sponsor anything, and that is deliberate:
-- lib/chain/sponsorship.ts requires the flag AND an attested chain id AND
-- budget on both counters before it will say the realm pays. Four locks, and a
-- surface that promises free gas with any one of them shut would be lying to a
-- member about money.

insert into public.realm_flags (key, enabled)
values ('gasless_live', false)
on conflict (key) do nothing;

-- ============================================================
-- 2. The sponsorship ledger
-- ============================================================
--
-- One row per act the realm agreed to pay gas for. The row IS the budget: there
-- is no counter column anywhere, because a counter and a ledger disagree the
-- first time one of them is written and the other is not, and the one that gets
-- believed is always the wrong one.
--
-- THREE STATUSES, AND 'released' IS THE ONE THAT MATTERS. A reservation is
-- taken before the member's wallet is asked to do anything, because the check
-- and the write have to be one transaction (see section 4). Most reservations
-- become 'spent'. The ones that do not are members who closed the wallet prompt,
-- and if those stayed reserved forever the realm would slowly starve its own
-- free tier paying for transactions that never happened. Sweeping them back is
-- what makes the budget describe reality rather than intent.
--
-- WHAT IS NOT RECORDED: no calldata, no value, no counterparty. This ledger
-- answers "did the realm pay gas for this member, for this act, when", and
-- nothing else. A sponsorship record that also carried what was signed would be
-- a transaction log the realm has no business keeping about a wallet it does
-- not hold.

create table if not exists public.wallet_sponsorship_grants (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,

  -- Which act was sponsored. A text check rather than an enum, for the same
  -- reason commerce_guard_events.kind is: an enum needs a migration to add a
  -- value, and a value that cannot be added is a value that gets logged under
  -- the wrong name.
  act text not null,

  -- The thing being acted on, as the calling route names it: a claim id, an
  -- inventory id, a listing id. Carried so a grant can be reconciled against
  -- the ledger that owns the act, and so asking twice is one ask.
  subject_ref text not null,

  chain_id integer not null,

  status text not null default 'reserved',

  -- The user operation the bundler returned, once there is one. Null while
  -- reserved, and null forever on a released grant. Never a transaction hash:
  -- a sponsored act is a user operation and the two are different objects, and
  -- storing one under the other's name is how a reconciliation quietly finds
  -- nothing.
  user_op_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wallet_sponsorship_grants_pkey primary key (id),
  constraint wallet_sponsorship_grants_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  constraint wallet_sponsorship_grants_act_check
    check (act <> ''::text and char_length(act) <= 40),
  constraint wallet_sponsorship_grants_subject_check
    check (subject_ref <> ''::text and char_length(subject_ref) <= 100),
  constraint wallet_sponsorship_grants_status_check
    check (status = any (array['reserved'::text, 'spent'::text, 'released'::text])),
  constraint wallet_sponsorship_grants_user_op_check
    check (user_op_hash is null or user_op_hash ~ '^0x[0-9a-f]{64}$')
);

-- The two counts every reservation makes. Both are over a rolling window and
-- both exclude released grants, so they are indexed on the columns the window
-- and the filter use.
create index if not exists wallet_sponsorship_grants_member_idx
  on public.wallet_sponsorship_grants (profile_id, created_at desc)
  where status <> 'released'::text;

create index if not exists wallet_sponsorship_grants_realm_idx
  on public.wallet_sponsorship_grants (created_at desc)
  where status <> 'released'::text;

-- Asking twice is one ask, enforced rather than hoped for. A double tap, a
-- retry after a dropped connection or a member returning to an unfinished mint
-- must all land on the same grant instead of spending the budget twice on one
-- act. Partial, so a released grant does not block a genuine second attempt at
-- the same subject.
create unique index if not exists wallet_sponsorship_grants_live_uidx
  on public.wallet_sponsorship_grants (profile_id, act, subject_ref)
  where status <> 'released'::text;

-- ============================================================
-- 3. The member set ceiling, and why it is not the commerce cap
-- ============================================================
--
-- THIS IS THE QUESTION THE MISSION ASKED, so the answer is written down here
-- rather than left to whoever reads the two tables next.
--
-- public.member_commerce_limits.self_cap_minor caps what THE REALM MAY CHARGE A
-- MEMBER. It is in integer minor units of USD. It is enforceable in the strong
-- sense: public.commerce_checkout_guard evaluates it and inserts the order in
-- one transaction under one lock, so ten concurrent checkouts cannot each read
-- a spend of zero. The realm can enforce it because the realm is the party
-- taking the money.
--
-- THIS COLUMN IS A DIFFERENT OBJECT AND MERGING THEM WOULD BE A LIE. It caps
-- the value of a transaction THE REALM'S OWN SURFACES WILL BUILD AND ASK A
-- MEMBER TO SIGN. Three differences, and every one of them is load bearing:
--
--   UNIT. Cents against wei. There is no honest shared column: one is a fixed
--   claim on the realm, the other is a quantity of an asset whose fiat value
--   moves while the member is reading the screen.
--
--   ENFORCEABILITY. The commerce cap is enforced. This one is OBSERVED. Rule 6
--   means the realm is never a party to an on-chain transfer and holds no key
--   that could refuse one. A member with a ceiling of 0.01 ETH set here can
--   still open Privy's own wallet interface, or export the wallet, or connect
--   it to anything, and sign whatever they like. Nothing in this database can
--   stop that and nothing in this database should pretend to. What this ceiling
--   really does is bind the realm: no Ravenspire surface will build calldata
--   worth more than it without the member raising it first. That is a genuinely
--   useful thing (it is the guardrail against a fat finger on the Bazaar, and
--   against a compromised realm surface asking for more than a member ever
--   intended) and it is emphatically not the same promise.
--
--   WHAT IT PROTECTS AGAINST. The commerce cap protects a member from the
--   realm's checkout. This protects a member from the realm's calldata. A
--   member reading one and believing they had also set the other would be worse
--   off than a member who had set neither, because they would think they were
--   covered.
--
-- The one thing the two DO share is the asymmetry, and it is shared because the
-- reason is identical and has nothing to do with money: lowering applies at
-- once, raising waits. A limit a member can raise in the moment they want to
-- raise it is not a limit, it is a slider. Copied deliberately rather than
-- factored out, because the two functions take different units and a shared
-- helper across them would be the first step back toward one feature with two
-- meanings.
--
-- THE ENFORCED VERSION OF THIS IS DARK AND NAMED. A ceiling a member's own
-- wallet would refuse to exceed is an on-chain policy on a smart account, a
-- session key with a spending limit the account contract itself checks. That is
-- real, it is what this column is a rehearsal for, and it waits on exactly one
-- thing: a smart account existing, which is founder configuration in the Privy
-- dashboard. Until then the surfaces say "this binds Ravenspire, not your keys"
-- in those words.

create table if not exists public.member_wallet_guardrails (
  profile_id uuid not null,

  -- Wei, as an exact integer. numeric(78,0) because a uint256 tops out at 78
  -- decimal digits, and because every other shape loses. bigint overflows at
  -- 9.2e18, which is nine ETH. double precision would put a float in the middle
  -- of a spending limit, which is the thing lib/commerce/money.ts exists to
  -- prevent. Null means the member has set no ceiling of their own, which is
  -- the default and is not a ceiling of zero.
  tx_ceiling_wei numeric(78, 0),

  -- A raise in waiting. Until pending_tx_ceiling_at passes, the lower value in
  -- tx_ceiling_wei is still the one applied.
  pending_tx_ceiling_wei numeric(78, 0),
  pending_tx_ceiling_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_wallet_guardrails_pkey primary key (profile_id),
  constraint member_wallet_guardrails_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete cascade,
  -- Zero is a legitimate ceiling: it means "no Ravenspire surface may ask me to
  -- sign anything that moves value", which is exactly what a member who only
  -- ever claims cards wants. Negative is not a ceiling.
  constraint member_wallet_guardrails_ceiling_check
    check (tx_ceiling_wei is null or tx_ceiling_wei >= 0),
  constraint member_wallet_guardrails_pending_ceiling_check
    check (pending_tx_ceiling_wei is null or pending_tx_ceiling_wei >= 0),
  -- A pending raise without a time to land, or a time with nothing to land, is
  -- a half written intention a later reader would have to guess about.
  constraint member_wallet_guardrails_pending_pair_check
    check ((pending_tx_ceiling_wei is null) = (pending_tx_ceiling_at is null))
);

-- ============================================================
-- 4. Reserving a sponsorship
-- ============================================================
--
-- The check and the insert are one transaction, for the reason the compliance
-- guardrails header sets out: a budget read in one round trip and written in the
-- next is not a budget, because ten concurrent claims each read a spend of zero
-- and all ten pass.
--
-- WHY AN ADVISORY LOCK AND NOT A ROW LOCK. The member counter could be guarded
-- by locking the member's own row, the way commerce_limits_locked does. The
-- REALM counter cannot: there is no row that represents the realm. So the whole
-- reservation serialises behind one transaction-scoped advisory lock. That is a
-- real cost, and it is bought knowingly: reservations happen at the rate members
-- claim collectibles, which is nowhere near a rate where one lock is a
-- bottleneck, and the alternative is a realm-wide budget that is not one. The
-- lock is transaction scoped, so it releases on commit or rollback with no way
-- to leak it.
--
-- EVERY THRESHOLD IS A REQUIRED PARAMETER WITH NO DEFAULT, matching the posture
-- in the compliance guardrails. A default here would be a second copy of a
-- number that also lives in lib/chain/sponsorship.ts, and two copies of a
-- threshold drift the first time somebody tunes one of them. A required
-- parameter cannot drift because it cannot exist in two places.

create or replace function public.wallet_sponsorship_reserve(
  p_profile_id uuid,
  p_act text,
  p_subject_ref text,
  p_chain_id integer,
  p_member_allowance integer,
  p_realm_allowance integer,
  p_window_hours integer,
  p_stale_minutes integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_existing public.wallet_sponsorship_grants;
  v_member_used integer;
  v_realm_used integer;
  v_id uuid;
  v_since timestamptz;
begin
  -- Serialise the whole decision. hashtext of a fixed string rather than a
  -- magic number so the lock has a readable name at the call site; the
  -- namespaced two-argument form keeps it from colliding with any other
  -- advisory lock the schema might grow.
  perform pg_advisory_xact_lock(hashtext('ravenspire.wallet_sponsorship'));

  -- Sweep this member's stale reservations back into the budget. Scoped to the
  -- member rather than swept globally, because a global sweep inside every
  -- reservation would rewrite unrelated rows under a lock everybody is queuing
  -- behind. A member's own stale rows are the ones standing between them and
  -- their next act, and they are the ones that get cleared.
  update public.wallet_sponsorship_grants
     set status = 'released', updated_at = now()
   where profile_id = p_profile_id
     and status = 'reserved'
     and created_at < now() - make_interval(mins => p_stale_minutes);

  -- Asking twice is one ask. A live grant for this exact act on this exact
  -- subject is handed straight back rather than spending the budget again.
  select * into v_existing
    from public.wallet_sponsorship_grants
   where profile_id = p_profile_id
     and act = p_act
     and subject_ref = p_subject_ref
     and status <> 'released'
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'grant_id', v_existing.id,
      'status', v_existing.status,
      'reissued', false
    );
  end if;

  v_since := now() - make_interval(hours => p_window_hours);

  select count(*) into v_member_used
    from public.wallet_sponsorship_grants
   where profile_id = p_profile_id
     and status <> 'released'
     and created_at >= v_since;

  if v_member_used >= p_member_allowance then
    -- Refused, and named. The route turns this into a sentence and the member
    -- still gets to act, paying their own gas. A refusal here is never a dead
    -- end, only a change of who pays.
    return jsonb_build_object(
      'ok', false,
      'reason', 'member_allowance',
      'member_used', v_member_used,
      'member_allowance', p_member_allowance
    );
  end if;

  select count(*) into v_realm_used
    from public.wallet_sponsorship_grants
   where status <> 'released'
     and created_at >= v_since;

  if v_realm_used >= p_realm_allowance then
    return jsonb_build_object(
      'ok', false,
      'reason', 'realm_allowance',
      'realm_used', v_realm_used,
      'realm_allowance', p_realm_allowance
    );
  end if;

  insert into public.wallet_sponsorship_grants (
    profile_id, act, subject_ref, chain_id
  )
  values (p_profile_id, p_act, p_subject_ref, p_chain_id)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'grant_id', v_id,
    'status', 'reserved',
    'reissued', true,
    'member_used', v_member_used + 1,
    'member_allowance', p_member_allowance,
    'realm_used', v_realm_used + 1,
    'realm_allowance', p_realm_allowance
  );
end;
$$;

-- ============================================================
-- 5. Settling a sponsorship
-- ============================================================
--
-- A reservation ends one of two ways: the user operation landed and the realm
-- really did pay ('spent'), or it did not and the budget goes back ('released').
-- Scoped to the owning profile, because a grant id is a uuid a caller could in
-- principle hold from somewhere else and settling somebody else's grant is not
-- a thing any route should be able to do by mistake.
--
-- Only a reserved grant moves. A settled grant is history: re-settling one
-- would either double count the budget or quietly resurrect a released act.

create or replace function public.wallet_sponsorship_settle(
  p_profile_id uuid,
  p_grant_id uuid,
  p_status text,
  p_user_op_hash text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.wallet_sponsorship_grants;
begin
  if p_status not in ('spent', 'released') then
    raise exception 'wallet_sponsorship_settle: status must be spent or released, got %', p_status;
  end if;

  update public.wallet_sponsorship_grants
     set status = p_status,
         -- A released grant never carries a hash. It is the record of an act
         -- that did not happen, and hanging an operation hash on it would make
         -- it look like one that did.
         user_op_hash = case when p_status = 'spent' then p_user_op_hash else null end,
         updated_at = now()
   where id = p_grant_id
     and profile_id = p_profile_id
     and status = 'reserved'
   returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_reserved');
  end if;

  return jsonb_build_object('ok', true, 'status', v_row.status);
end;
$$;

-- ============================================================
-- 6. Setting the ceiling
-- ============================================================
--
-- Lowering, or setting one for the first time, takes effect at once. Raising
-- one, or clearing it entirely (which is a raise to no ceiling at all and is
-- treated as one), waits p_delay_hours, and until then the lower value is still
-- what the surfaces apply.
--
-- There is no realm ceiling to sit under, unlike commerce_set_self_cap. The
-- realm has no opinion on what a member's own wallet may sign and cannot have
-- one, so there is no upper bound to validate against. The only refusal is a
-- negative number, which the check constraint already forbids.

create or replace function public.wallet_set_tx_ceiling(
  p_profile_id uuid,
  p_ceiling_wei numeric,
  p_delay_hours integer
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.member_wallet_guardrails;
  v_current numeric;
  v_is_raise boolean;
begin
  if p_ceiling_wei is not null and p_ceiling_wei < 0 then
    raise exception 'wallet_set_tx_ceiling: a ceiling cannot be negative';
  end if;

  -- Create the row if it is missing, then lock it. Two statements rather than
  -- one upsert because the comparison below has to happen against a value no
  -- concurrent call can change underneath it, and an upsert that also returns
  -- the prior value cannot express that.
  insert into public.member_wallet_guardrails (profile_id)
  values (p_profile_id)
  on conflict (profile_id) do nothing;

  select * into v_row
    from public.member_wallet_guardrails
   where profile_id = p_profile_id
   for update;

  -- Promote a raise that has come due before comparing, so a member who waited
  -- out their delay and then lowers again is compared against the ceiling they
  -- are actually living under rather than a stale one.
  if v_row.pending_tx_ceiling_at is not null and v_row.pending_tx_ceiling_at <= now() then
    v_current := v_row.pending_tx_ceiling_wei;
  else
    v_current := v_row.tx_ceiling_wei;
  end if;

  -- No ceiling set means anything is permitted, so any named ceiling is a
  -- lowering. Clearing a ceiling is a raise. Everything else compares.
  v_is_raise := case
    when p_ceiling_wei is null then v_current is not null
    when v_current is null then false
    else p_ceiling_wei > v_current
  end;

  if v_is_raise then
    update public.member_wallet_guardrails
       set tx_ceiling_wei = v_current,
           pending_tx_ceiling_wei = p_ceiling_wei,
           pending_tx_ceiling_at = now() + make_interval(hours => p_delay_hours),
           updated_at = now()
     where profile_id = p_profile_id
     returning * into v_row;
  else
    update public.member_wallet_guardrails
       set tx_ceiling_wei = p_ceiling_wei,
           pending_tx_ceiling_wei = null,
           pending_tx_ceiling_at = null,
           updated_at = now()
     where profile_id = p_profile_id
     returning * into v_row;
  end if;

  -- Wei travels as a decimal string. jsonb would render a numeric as a JSON
  -- number, and every JSON parser on the receiving end would round it somewhere
  -- above 2^53, which for wei is a thousandth of an ETH. The same reason
  -- lib/chain/claim-voucher.ts carries uint256 fields as strings.
  return jsonb_build_object(
    'ok', true,
    'tx_ceiling_wei', v_row.tx_ceiling_wei::text,
    'pending_tx_ceiling_wei', v_row.pending_tx_ceiling_wei::text,
    'pending_tx_ceiling_at', v_row.pending_tx_ceiling_at,
    'delayed', v_is_raise
  );
end;
$$;

-- ============================================================
-- 7. Everything a member is owed about their own wallet guardrails
-- ============================================================
--
-- One read. The surfaces render what this returns and derive nothing, so a
-- member is never shown a budget or a ceiling the server would not actually
-- apply.
--
-- A due raise is reported as already in force even though this function is
-- STABLE and cannot promote it, matching commerce_limits_state: the next write
-- promotes it for real, and showing the old ceiling here would tell a member
-- their raise had not landed when the very next action will honour it.

create or replace function public.wallet_guardrails_state(
  p_profile_id uuid,
  p_window_hours integer,
  p_member_allowance integer,
  p_realm_allowance integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.member_wallet_guardrails;
  v_member_used integer;
  v_realm_used integer;
  v_ceiling numeric;
  v_since timestamptz;
begin
  select * into v_row
    from public.member_wallet_guardrails
   where profile_id = p_profile_id;

  v_since := now() - make_interval(hours => p_window_hours);

  -- Stale reservations are NOT swept here. This function is STABLE and must not
  -- write, and a read that quietly repaired the ledger would make the number a
  -- member sees depend on who last looked at it. The consequence is that a
  -- member with an abandoned reservation sees one fewer sponsored act than they
  -- will actually get, which is the safe direction: the realm under-promises
  -- and the next reserve call sweeps and corrects it.
  select count(*) into v_member_used
    from public.wallet_sponsorship_grants
   where profile_id = p_profile_id
     and status <> 'released'
     and created_at >= v_since;

  select count(*) into v_realm_used
    from public.wallet_sponsorship_grants
   where status <> 'released'
     and created_at >= v_since;

  v_ceiling := case
    when v_row.pending_tx_ceiling_at is not null and v_row.pending_tx_ceiling_at <= now()
      then v_row.pending_tx_ceiling_wei
    else v_row.tx_ceiling_wei
  end;

  return jsonb_build_object(
    'tx_ceiling_wei', v_ceiling::text,
    'pending_tx_ceiling_wei',
      case when v_row.pending_tx_ceiling_at > now()
        then v_row.pending_tx_ceiling_wei::text end,
    'pending_tx_ceiling_at',
      case when v_row.pending_tx_ceiling_at > now()
        then v_row.pending_tx_ceiling_at end,
    'member_used', v_member_used,
    'member_allowance', p_member_allowance,
    'realm_used', v_realm_used,
    'realm_allowance', p_realm_allowance
  );
end;
$$;

-- ============================================================
-- 8. Seal everything
-- ============================================================

alter table public.wallet_sponsorship_grants enable row level security;
alter table public.member_wallet_guardrails enable row level security;

revoke all on public.wallet_sponsorship_grants from anon, authenticated;
revoke all on public.member_wallet_guardrails from anon, authenticated;

revoke all on function public.wallet_sponsorship_reserve(
  uuid, text, text, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.wallet_sponsorship_reserve(
  uuid, text, text, integer, integer, integer, integer, integer
) to service_role;

revoke all on function public.wallet_sponsorship_settle(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.wallet_sponsorship_settle(uuid, uuid, text, text)
  to service_role;

revoke all on function public.wallet_set_tx_ceiling(uuid, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.wallet_set_tx_ceiling(uuid, numeric, integer)
  to service_role;

revoke all on function public.wallet_guardrails_state(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.wallet_guardrails_state(uuid, integer, integer, integer)
  to service_role;
