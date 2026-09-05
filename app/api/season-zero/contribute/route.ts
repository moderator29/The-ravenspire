import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import {
  verifyContribution,
  invalidateRoundState,
  weiFromNumeric,
} from "@/lib/season-zero/server";
import { SEASON_ZERO, seasonZeroPhase, rspForWei } from "@/lib/season-zero";
import { getFlag } from "@/lib/flags";

/* POST /api/season-zero/contribute: register a Season Zero contribution.
 * Body: { txHash, chainId }.
 *
 * The client supplies nothing but the hash and the chain. The sender, the
 * value and whether the treasury was actually paid are read from the chain by
 * verifyContribution; the recorded amount is the chain's, never the
 * caller's. A transaction that has not settled yet answers 202 so the client
 * can ask again; a transaction the chain refutes answers 422 and asking
 * again will not change it.
 *
 * IDEMPOTENT ON THE TRANSACTION. The unique key on (chain_id, tx_hash) means
 * a resubmission, a double click or a race between the Vault flow's
 * automatic registration and a manual paste all resolve to the one existing
 * row, returned with alreadyRecorded rather than an error. */

export const dynamic = "force-dynamic";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ALLOWED_CHAIN_IDS = new Set<number>(SEASON_ZERO.chains.map((c) => c.id));

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Every submission costs an RPC read, so the ceiling is what stops a script
     turning this route into a free chain scanner. A real backer registers a
     handful of transactions and polls a settling one every five seconds for
     up to a minute (see components/season-zero/api.ts); sixty an hour covers
     several full settle cycles with room. Keyed on the account, like every
     other mutating route. */
  const rl = await rateLimit(profileKey("season-zero", profile.id), 60, 3600);
  if (!rl.ok) {
    return json(
      { error: "rate_limited", retryAfter: rl.retryAfter },
      429
    );
  }

  const body = (await req.json().catch(() => null)) as {
    txHash?: unknown;
    chainId?: unknown;
  } | null;

  const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
  const chainId = typeof body?.chainId === "number" ? body.chainId : NaN;

  if (!TX_HASH_RE.test(txHash)) {
    return json({ error: "That is not a transaction hash" }, 400);
  }
  if (!Number.isInteger(chainId) || !ALLOWED_CHAIN_IDS.has(chainId)) {
    return json({ error: "Contributions are accepted on Base and Ethereum only" }, 400);
  }

  /* Idempotency fast path, and it runs BEFORE the phase gate on purpose: a
     transaction already recorded is answered from the table without another
     chain read, whoever holds it and whenever they ask, so a member
     re-checking a receipt five minutes after the window closes still gets
     their row rather than a refusal. A hash someone else already registered
     is not re-attributable, and saying only "already recorded" keeps this
     route from confirming whose it is. */
  const existing = await db
    .from("season_zero_contributions")
    .select("id, user_id, chain_id, tx_hash, wallet_address, amount_wei, status, created_at")
    .eq("chain_id", chainId)
    .eq("tx_hash", txHash.toLowerCase())
    .maybeSingle();
  if (existing.data) {
    return alreadyRecorded(existing.data, profile.id);
  }

  /* The founder's own switch, checked after idempotency for the same reason
     the phase gate below is: a contribution already recorded stays readable
     as its own row whatever the round's current state, since that write
     already happened and is a fact. This is the archive lever. It fails
     closed like every flag in lib/flags.ts, so an unset key or an unreadable
     table means the round refuses new contributions, and reopening it later
     is one row in realm_flags, not a deploy. */
  const seasonZeroLive = await getFlag("season_zero_live");
  if (!seasonZeroLive) {
    return json({ error: "Season Zero is not currently open" }, 403);
  }

  /* The window, enforced where it cannot be bypassed. The page also gates its
     controls by phase, but a control is a rendering decision and this is the
     write. */
  const phase = seasonZeroPhase();
  if (phase === "upcoming") {
    return json({ error: "Season Zero opens September 1", phase }, 403);
  }
  if (phase === "ended") {
    return json({ error: "Season Zero has closed", phase }, 403);
  }

  const verdict = await verifyContribution(txHash.toLowerCase() as `0x${string}`, chainId);
  if (!verdict.ok) {
    return json(
      { error: verdict.reason, pending: verdict.pending },
      verdict.pending ? 202 : 422
    );
  }

  const { data: created, error } = await db
    .from("season_zero_contributions")
    .insert({
      user_id: profile.id,
      wallet_address: verdict.from.toLowerCase(),
      chain_id: chainId,
      tx_hash: txHash.toLowerCase(),
      amount_wei: verdict.valueWei.toString(),
    })
    .select("id, user_id, chain_id, tx_hash, wallet_address, amount_wei, status, created_at")
    .single();

  if (error || !created) {
    /* 23505 is the unique key on (chain_id, tx_hash): a concurrent submission
       of the same transaction won the race. Resolve to the row that exists,
       which is the idempotent answer, not an error. */
    if (error?.code === "23505") {
      const raced = await db
        .from("season_zero_contributions")
        .select("id, user_id, chain_id, tx_hash, wallet_address, amount_wei, status, created_at")
        .eq("chain_id", chainId)
        .eq("tx_hash", txHash.toLowerCase())
        .maybeSingle();
      if (raced.data) return alreadyRecorded(raced.data, profile.id);
    }
    return json({ error: "The contribution could not be recorded" }, 500);
  }

  invalidateRoundState();
  return json({ contribution: shape(created), alreadyRecorded: false }, 201);
}

type Row = {
  id: string;
  user_id: string;
  chain_id: number;
  tx_hash: string;
  wallet_address: string;
  amount_wei: unknown;
  status: string;
  created_at: string;
};

function shape(row: Row) {
  const wei = weiFromNumeric(row.amount_wei);
  return {
    id: row.id,
    chainId: row.chain_id,
    txHash: row.tx_hash,
    walletAddress: row.wallet_address,
    amountWei: wei.toString(),
    rsp: rspForWei(wei).toString(),
    status: row.status,
    createdAt: row.created_at,
  };
}

function alreadyRecorded(row: Row, callerId: string) {
  /* The caller's own row comes back whole; someone else's transaction is
     acknowledged as taken without disclosing its details. */
  if (row.user_id === callerId) {
    return json({ contribution: shape(row), alreadyRecorded: true }, 200);
  }
  return json(
    { error: "That transaction is already registered to another member", alreadyRecorded: true },
    409
  );
}
