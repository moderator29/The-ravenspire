-- Tributes and trades carry proof, or they carry a mark saying they do not.
--
-- THE HOLE
-- Both public.tips and public.trades were written from a client-supplied
-- transaction hash that nothing checked. Any signed-in member could post a hash
-- found on a block explorer, or invented outright, and the realm published it:
-- a tribute the recipient never received, ringing their ravens, or a trade in
-- the shared feed fanning a notification out to every follower. Fabricated
-- social proof, produced with a curl command. The rate limits added in the
-- hardening pass slowed that down; they never made the claim true.
--
-- THE COLUMN
-- verified_at is when the realm read the receipt off the chain and found it
-- real: the transaction succeeded, it was sent by that member's own wallet, and
-- for a tribute the value reached the named recipient. Null means unproven, and
-- unproven has two honest causes that the product treats identically: the chain
-- has not settled the transaction yet, and the realm has no RPC endpoint for
-- that chain.
--
-- WHY NULL IS ALLOWED TO EXIST AT ALL
-- Failing closed would be the wrong trade. A member who records a tribute two
-- seconds after broadcasting it has done nothing wrong, and an environment
-- shipped without an RPC key has not caught anybody lying; refusing both would
-- take tipping down to punish neither. So an unproven row is written, kept out
-- of the shared trade feed, and raises no notification. It costs the member
-- nothing and it earns them no audience, which is exactly the right shape: the
-- thing being defended is the social proof, not the record.
--
-- Every row already in these tables predates verification and is honestly left
-- null rather than backfilled as proven. Nothing may claim a check that never
-- ran.

alter table public.tips
  add column if not exists verified_at timestamptz;

alter table public.trades
  add column if not exists verified_at timestamptz;

-- The realm feed reads verified trades, newest first, and that is now the only
-- query the feed makes. Partial, because unverified rows are never in it.
create index if not exists trades_verified_created_idx
  on public.trades (created_at desc)
  where verified_at is not null;

-- A member's own tribute history still shows everything they sent, proven or
-- not, so this index covers the whole table rather than the verified part.
create index if not exists tips_to_created_idx
  on public.tips (to_id, created_at desc);
