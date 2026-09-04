import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse } from "../_admin";
import { seasonZeroChains, weiFromNumeric } from "@/lib/season-zero/server";
import { SEASON_ZERO, rspForWei, seasonZeroPhase } from "@/lib/season-zero";

/* GET /api/admin/season-zero: the founding round, read by the council.
 *
 * The public route serves the aggregate every member sees. This one serves the
 * roll behind it: who backed the round, from which wallet, on which chain, for
 * how much, and whether that row still counts. Until this existed the founder
 * had no way to see any of it, which is a strange thing to be able to say about
 * the money raised to build the place.
 *
 * THE ADMIN RAISE AND THE PUBLIC RAISE ARE THE SAME NUMBER, BY CONSTRUCTION.
 * lib/season-zero/server.ts sums `amount_wei` through `weiFromNumeric` over
 * every row with status 'verified', and counts distinct `user_id` across the
 * same rows, with no limit. The totals read below does exactly that: the same
 * table, the same column, the same converter, the same distinct count, and no
 * limit of its own. Two figures assembled by two different rules would be two
 * numbers, and the founder could not trust either.
 *
 * That is why the totals read is deliberately NOT the bounded one. A limit here
 * would silently cap the raise at whatever the limit was, and the public bar
 * would then disagree with the council's. The bounded query is the detail list,
 * which is a page of rows rather than an aggregate, and it reports how many rows
 * exist so a clipped list says so rather than reading as the whole story.
 *
 * The public aggregate is cached for thirty seconds in getRoundState, so within
 * that window the two surfaces can be out of step by whatever landed inside it.
 * That is staleness, not disagreement: the rule producing both is one rule. The
 * cache is why this route sums the rows itself rather than calling getRoundState
 * and reading a figure up to thirty seconds older than the list beside it. Phase
 * is read from seasonZeroPhase(), which is where getRoundState reads it too.
 *
 * REFUNDED ROWS NEVER TOUCH THE RAISE. A contribution marked refunded is money
 * that went back to its sending wallet, so it is reported on its own line and
 * summed on its own, and it is excluded from the raise exactly as the public
 * aggregate excludes it.
 *
 * Every wei figure crosses the wire as a string. JSON numbers are IEEE doubles
 * and 15 ETH of wei does not fit in one.
 *
 * The chain list carries `verifiable`, from seasonZeroChains(). A deployment
 * with no RPC endpoint cannot read a receipt, so the public page withdraws the
 * treasury address on that chain and contributions there are paused. The
 * council learns that from this field rather than from a quiet week.
 */

export const dynamic = "force-dynamic";

/* The detail list is a page, not the ledger. Generous for the realm's size:
   the hardcap is 15 ETH at a 0.01 ETH minimum, so the round cannot produce
   more rows than this without every one of them being dust. */
const LIST_LIMIT = 500;

const WEI = 10n ** 18n;

/* Whole ETH to wei without passing through a float. */
function ethToWei(eth: number): bigint {
  return BigInt(Math.round(eth * 1e6)) * 10n ** 12n;
}

/* A percentage against a cap, to one decimal, computed in integer math so a
   large numerator never loses its tail to a double. Uncapped on purpose: a
   raise past the softcap should read as past it, and the surface decides how
   to draw a bar it has overrun. */
function pctOf(amount: bigint, cap: bigint): number {
  if (cap <= 0n) return 0;
  return Number((amount * 1000n) / cap) / 10;
}

interface ContributionRow {
  id: string;
  user_id: string | null;
  wallet_address: string | null;
  chain_id: number | null;
  tx_hash: string | null;
  amount_wei: unknown;
  status: string | null;
  created_at: string | null;
  member?:
    | { handle: string | null; display_name: string | null }
    | { handle: string | null; display_name: string | null }[]
    | null;
}

/* PostgREST returns an embedded one-to-one either as an object or, depending on
   how it reads the relationship, as a single element array. Both are the same
   member. */
function memberOf(row: ContributionRow) {
  const m = Array.isArray(row.member) ? (row.member[0] ?? null) : (row.member ?? null);
  return {
    handle: m?.handle ?? null,
    displayName: m?.display_name ?? null,
  };
}

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  /* The totals read. Same shape as getRoundState's, plus `status` so the
     refunded rows can be reported separately rather than simply dropped. */
  const totals = await db
    .from("season_zero_contributions")
    .select("user_id, amount_wei, status");
  if (totals.error) {
    /* The table not existing yet is a real state in an environment where the
       migration has not been applied, and it is not the same as a failure. */
    if (totals.error.code === "42P01") {
      return json({ error: "season zero is not migrated yet" }, 503);
    }
    return json({ error: "query_failed" }, 500);
  }

  let verifiedWei = 0n;
  let refundedWei = 0n;
  let verifiedCount = 0;
  let refundedCount = 0;
  const verifiedBackers = new Set<string>();
  const refundedBackers = new Set<string>();
  for (const row of (totals.data ?? []) as {
    user_id: string | null;
    amount_wei: unknown;
    status: string | null;
  }[]) {
    const wei = weiFromNumeric(row.amount_wei);
    if (row.status === "refunded") {
      refundedWei += wei;
      refundedCount += 1;
      if (row.user_id) refundedBackers.add(String(row.user_id));
      continue;
    }
    /* Everything that is not refunded is verified: the status check on the
       table allows exactly those two values, and the same reading as
       getRoundState's `.eq("status", "verified")`. */
    if (row.status !== "verified") continue;
    verifiedWei += wei;
    verifiedCount += 1;
    if (row.user_id) verifiedBackers.add(String(row.user_id));
  }

  /* The detail list. Newest first, bounded, and the only read here that is. */
  const listed = await db
    .from("season_zero_contributions")
    .select(
      "id, user_id, wallet_address, chain_id, tx_hash, amount_wei, status, created_at, member:profiles!season_zero_contributions_user_id_fkey (handle, display_name)"
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (listed.error) return json({ error: "query_failed" }, 500);

  const contributions = ((listed.data ?? []) as unknown as ContributionRow[]).map(
    (row) => {
      const wei = weiFromNumeric(row.amount_wei);
      const member = memberOf(row);
      return {
        id: row.id,
        handle: member.handle,
        displayName: member.displayName,
        walletAddress: row.wallet_address ?? "",
        chainId: row.chain_id ?? 0,
        txHash: row.tx_hash ?? "",
        amountWei: wei.toString(),
        rsp: rspForWei(wei).toString(),
        status: row.status === "refunded" ? "refunded" : "verified",
        createdAt: row.created_at,
      };
    }
  );

  const softcapWei = ethToWei(SEASON_ZERO.softcapEth);
  const hardcapWei = ethToWei(SEASON_ZERO.hardcapEth);

  return json({
    phase: seasonZeroPhase(),
    /* The raise, and it is the verified sum with nothing else in it. */
    raisedWei: verifiedWei.toString(),
    backerCount: verifiedBackers.size,
    rspAllocated: rspForWei(verifiedWei).toString(),
    softcapMet: verifiedWei >= softcapWei,
    softcapPct: pctOf(verifiedWei, softcapWei),
    hardcapPct: pctOf(verifiedWei, hardcapWei),
    verified: {
      count: verifiedCount,
      backerCount: verifiedBackers.size,
      totalWei: verifiedWei.toString(),
    },
    refunded: {
      count: refundedCount,
      backerCount: refundedBackers.size,
      totalWei: refundedWei.toString(),
    },
    contributions,
    /* So a clipped list can say it is clipped instead of reading as the whole
       round. */
    rowCount: verifiedCount + refundedCount,
    listLimit: LIST_LIMIT,
    round: {
      startsAt: SEASON_ZERO.startsAt,
      endsAt: SEASON_ZERO.endsAt,
      softcapEth: SEASON_ZERO.softcapEth,
      hardcapEth: SEASON_ZERO.hardcapEth,
      supplyPct: SEASON_ZERO.supplyPct,
      rspPerEth: SEASON_ZERO.rspPerEth,
      rspAllocation: SEASON_ZERO.rspAllocation,
      minContributionEth: SEASON_ZERO.minContributionEth,
      treasury: SEASON_ZERO.treasury,
      /* Not the bare constant: each chain carries whether this deployment can
         actually read it. An unverifiable chain is withdrawn from the public
         page, so the council has to be able to see that state here rather than
         infer it from contributions that stop arriving. */
      chains: seasonZeroChains(),
    },
  });
}
