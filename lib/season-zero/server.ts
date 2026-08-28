import "server-only";
import { createPublicClient, http } from "viem";
import { adminClient } from "@/lib/supabase/admin";
import { rpcUrl } from "@/lib/chain/rpc";
import { SEASON_ZERO, seasonZeroPhase, type SeasonZeroPhase } from "@/lib/season-zero";

/* Season Zero, server side: the on-chain check and the aggregate.
 *
 * THE RECORDED AMOUNT ALWAYS COMES FROM THE CHAIN. The client hands the route
 * nothing but a transaction hash and a chain id; the value, the sender and
 * whether the transfer reached the treasury at all are read from the chain
 * here. A raise total assembled any other way is a hand-typed number with
 * extra steps, and rule 4 has no exception for fundraising.
 *
 * RPC endpoints come from lib/chain/rpc.ts, the same resolver every other
 * verification in the realm uses (tips, trades, market legs): the Alchemy key
 * when configured, an EVM_RPC_URLS override when set, and honestly nothing
 * when neither exists. No default public transport is used as a fallback on
 * purpose, for the reason recorded in rpc.ts: reading a receipt off a
 * rate-limited public endpoint is how a real transfer gets told it never
 * happened, and this verification decides whether somebody's money counts. */

/* One confirmation past inclusion. head >= blockNumber + 1 means at least one
   block sits on top of the one that carries the transaction. */
const REQUIRED_CONFIRMATIONS = 1n;

const MIN_CONTRIBUTION_WEI = BigInt(
  Math.round(SEASON_ZERO.minContributionEth * 1e6)
) * 10n ** 12n;

export type ContributionVerdict =
  | { ok: true; from: string; valueWei: bigint }
  /* Real so far, but not settled, or not checkable from here. Worth asking
     again in a moment. Never recorded and never called a lie. */
  | { ok: false; pending: true; reason: string }
  /* Checked and wrong. Asking again will not change the answer. */
  | { ok: false; pending: false; reason: string };

/* Verify a claimed contribution against the chain itself. Requires: the
   transaction exists and succeeded, it was addressed to the treasury, it
   carried at least the minimum contribution, and at least one confirmation
   sits on top of it. Returns the sender and the true value in wei. */
export async function verifyContribution(
  txHash: `0x${string}`,
  chainId: number
): Promise<ContributionVerdict> {
  const url = rpcUrl(chainId);
  if (!url) {
    return {
      ok: false,
      pending: true,
      reason: "The realm cannot read that chain right now",
    };
  }

  const client = createPublicClient({ transport: http(url) });

  let receipt;
  let tx;
  try {
    [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }),
      client.getTransaction({ hash: txHash }),
    ]);
  } catch {
    /* viem throws when the node does not know the hash, which is the ordinary
       state of a transaction broadcast a moment ago and also the state of one
       that never existed. Calling both "pending" costs nothing: a pending
       submission is never recorded, and one that never settles never is. */
    return {
      ok: false,
      pending: true,
      reason: "The transaction has not been mined yet",
    };
  }

  if (receipt.status !== "success") {
    return { ok: false, pending: false, reason: "That transaction failed on chain" };
  }

  const to = tx.to ?? receipt.to ?? null;
  if (!to || to.toLowerCase() !== SEASON_ZERO.treasury.toLowerCase()) {
    return {
      ok: false,
      pending: false,
      reason: "That transaction did not pay the Season Zero treasury",
    };
  }

  if (tx.value < MIN_CONTRIBUTION_WEI) {
    return {
      ok: false,
      pending: false,
      reason: `That transaction carried less than the ${SEASON_ZERO.minContributionEth} ETH minimum`,
    };
  }

  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch {
    return { ok: false, pending: true, reason: "The chain could not be reached" };
  }
  if (head < receipt.blockNumber + REQUIRED_CONFIRMATIONS) {
    return { ok: false, pending: true, reason: "Waiting for the chain to settle" };
  }

  return { ok: true, from: receipt.from, valueWei: tx.value };
}

export type RoundState = {
  raisedWei: bigint;
  backerCount: number;
  phase: SeasonZeroPhase;
};

/* In-process cache, same shape and same reasoning as lib/flags.ts: the
   aggregate is read by a public route on every page view, thirty seconds of
   staleness is exactly the freshness a raise bar needs, and a failure is
   cached for the same window so a missing table or an unreachable database is
   asked about once per window rather than once per render. */
const TTL_MS = 30_000;
let cache: { at: number; raisedWei: bigint; backerCount: number } | null = null;

/* The round, summed from verified rows. FAILS SOFT, deliberately: this module
   ships before the migration is applied to the remote database, and a page
   must render the round (as zero raised, which is the honest reading of a
   table that does not exist yet) rather than throw. Do not "fix" this to
   surface errors; a broken aggregate read must never take the page down. */
export async function getRoundState(): Promise<RoundState> {
  const phase = seasonZeroPhase();
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    return { raisedWei: cache.raisedWei, backerCount: cache.backerCount, phase };
  }

  let raisedWei = 0n;
  let backerCount = 0;
  try {
    const db = adminClient();
    if (db) {
      const { data, error } = await db
        .from("season_zero_contributions")
        .select("user_id, amount_wei")
        .eq("status", "verified");
      if (!error && data) {
        const backers = new Set<string>();
        for (const row of data) {
          raisedWei += weiFromNumeric(row.amount_wei);
          if (row.user_id) backers.add(String(row.user_id));
        }
        backerCount = backers.size;
      }
    }
  } catch {
    raisedWei = 0n;
    backerCount = 0;
  }

  cache = { at: now, raisedWei, backerCount };
  return { raisedWei, backerCount, phase };
}

/* Drop the cache after a successful insert so the raise bar a contributor is
   looking at reflects their own contribution on the next read. */
export function invalidateRoundState(): void {
  cache = null;
}

/* Supabase returns numeric columns as strings (or, historically, numbers).
   Wei must never pass through a float, so the string path is the real one and
   the number path exists only to refuse quietly rather than corrupt. */
export function weiFromNumeric(raw: unknown): bigint {
  if (typeof raw === "string") {
    /* numeric can carry a decimal point in principle; wei never does. Take
       the integer part rather than throwing on a stray ".0". */
    const intPart = raw.split(".")[0];
    if (/^\d+$/.test(intPart)) return BigInt(intPart);
    return 0n;
  }
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) {
    return BigInt(raw);
  }
  return 0n;
}
