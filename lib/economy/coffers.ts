import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sumDecimal } from "@/lib/commerce/money";
import {
  foldStatement,
  reconcile,
  type EarningsStatement,
  type LedgerRow,
  type Reconciliation,
} from "@/lib/economy/earnings";

/* The reads behind The Coffers. The server half of lib/economy/earnings.ts.

   TWO LEDGERS, IN TWO UNITS, NEVER ADDED TOGETHER.

   POINTS are a realm score. They are not money, they are not $RSP, they are
   not redeemable for anything, and there is no rate at which they become
   anything. The surface this replaces printed "Points convert to $RSP at TGE"
   under the total, which is a financial promise the product has never made and
   is not entitled to make.

   VALUE is money that has already moved, on a public chain, into the member's
   own wallet. Every entry has a transaction hash and every entry is verified
   before it counts: a tribute counts only once verifyTribute has read it off
   the chain, and a Bazaar sale counts only once the buyer's payment leg has
   been proven from the pay token's own logs by verifyMarketLeg. Nothing here
   is a claim about money the platform is holding, because the platform is not
   holding any: see the doctrine in lib/economy/revenue.ts.

   THERE IS NO CLAIM BUTTON ANYWHERE ON THIS SURFACE, and its absence is the
   feature. A claim button implies a balance the realm is sitting on, and there
   is none: the money went from the payer's wallet to the member's wallet in
   the payer's own transaction and was never anywhere else.

   NO USD FIGURE IS PUT ON A TOKEN. A tribute of 0.01 of a chain's native coin
   is reported as 0.01 of that coin. Converting it would need a price at the
   moment of the tribute, which the realm did not record and cannot recover,
   and a price read today and applied to a payment made in March is an invented
   number with a dollar sign on it. Bazaar proceeds ARE reported in dollars,
   because the market quotes in dollars and settles in a dollar stablecoin, so
   the figure is the one the buyer actually agreed to. */

/* How many ledger rows one statement will read.

   A member past this has a statement folded from the most recent page, and the
   reconciliation refuses to draw a conclusion from it (see Reconciliation
   .partial). The full sum still comes back exactly, from
   public.reconcile_member_points, which does it in the database: the page is
   for the breakdown, never for the total. That split is the fix for the old
   surface, which added up whatever two thousand rows it happened to get and
   presented the result as a lifetime figure. */
const LEDGER_PAGE = 2_000;

/* ------------------------------------------------------------------
   The POINTS ledger
   ------------------------------------------------------------------ */

export interface PointsSide {
  statement: EarningsStatement;
  reconciliation: Reconciliation;
  /* The live balance, from profiles. The figure the rest of the realm spends. */
  balance: number;
  glory: number;
  /* Facts the ledger cannot know, read from call_stakes, which is the row that
     records what a settlement actually did. A burn writes no ledger row at all,
     so without these two the statement could only report "staked minus
     returned" and call it something it is not. */
  openStake: number;
  burnedStake: number;
  openCalls: number;
}

export async function loadPointsSide(
  db: SupabaseClient,
  profileId: string,
  /* The balance the session already knows, used only when the reconciliation
     read is unavailable. Without it a missing RPC renders a member's balance as
     zero, which is the single most alarming thing this surface could get wrong:
     a member would be told their POINTS were gone by a page that had simply
     failed to ask. */
  knownBalance: number
): Promise<PointsSide> {
  const [ledgerRes, reconRes, stakesRes] = await Promise.all([
    db
      .from("points_ledger")
      .select("id, points_delta, glory_delta, reason, category, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(LEDGER_PAGE),
    db.rpc("reconcile_member_points", { p_profile_id: profileId }),
    db
      .from("call_stakes")
      .select("stake, burned, status")
      .eq("profile_id", profileId)
      .limit(LEDGER_PAGE),
  ]);

  const rows = (ledgerRes.data ?? []) as LedgerRow[];
  const statement = foldStatement(rows);

  /* The RPC is the authority on the total. If it is unavailable the statement
     still renders, and the reconciliation reports partial rather than
     inventing a verdict from the page: an unchecked balance must never render
     as a checked one. */
  const recon = (reconRes.data ?? null) as {
    cached?: number;
    ledger?: number;
    glory_cached?: number;
    entries?: number;
  } | null;

  const entries = Number(recon?.entries ?? 0);
  const cached = recon === null ? knownBalance : Number(recon.cached ?? 0);
  const ledgerNet = Number(recon?.ledger ?? 0);
  /* Partial covers both "the ledger is longer than one page" and "the sum could
     not be taken at all". Neither may be reported as reconciled, and the second
     one must not be reported as a drift either: reconcile() reads partial before
     it reads the difference. */
  const partial = recon === null || entries > rows.length;

  let openStake = 0;
  let burnedStake = 0;
  let openCalls = 0;
  for (const s of (stakesRes.data ?? []) as {
    stake: number;
    burned: number;
    status: string;
  }[]) {
    if (s.status === "escrowed") {
      openStake += Number(s.stake) || 0;
      openCalls += 1;
    }
    burnedStake += Number(s.burned) || 0;
  }

  return {
    statement,
    reconciliation: reconcile({ cached, ledgerNet, partial }),
    balance: cached,
    glory: Number(recon?.glory_cached ?? 0),
    /* burnedStake is summed over one page of settled stakes. A member past that
       is under-reported rather than wrong, which is the safe direction for a
       figure describing what they lost. openStake cannot truncate: a member
       holds at most six open Calls. */
    openStake,
    burnedStake,
    openCalls,
  };
}

/* ------------------------------------------------------------------
   The value ledger
   ------------------------------------------------------------------ */

/* One asset a member has been paid in, and how much of it reached them.
   `amount` is an exact decimal string, never a number: see sumDecimal. */
export interface TributeTotal {
  chainId: number | null;
  token: string;
  amount: string;
  count: number;
}

export interface ValueEntry {
  kind: "tribute" | "bazaar-sale";
  /* What arrived, already formatted in its own unit. */
  amount: string;
  unit: string;
  at: string;
  /* The proof. Every entry on this ledger has one, or it is not on it. */
  txHash: string | null;
  chainId: number | null;
}

export interface ValueSide {
  tributes: TributeTotal[];
  /* Proceeds from settled Bazaar sales, in USD minor units. Exact integers. */
  bazaarMinor: number;
  bazaarSales: number;
  entries: ValueEntry[];
  /* Rows whose stored amount could not be read. Reported rather than hidden,
     so a total that is short says it is short. */
  unreadable: number;
  /* Tributes recorded but not yet proven against the chain. Counted and NOT
     included in any total: an unverified receipt is a claim, not a payment. */
  unverified: number;
}

const VALUE_PAGE = 500;

export async function loadValueSide(
  db: SupabaseClient,
  profileId: string
): Promise<ValueSide> {
  const [tipsRes, salesRes, unverifiedRes] = await Promise.all([
    db
      .from("tips")
      .select("amount, token, chain_id, tx_hash, created_at, verified_at")
      .eq("to_id", profileId)
      .not("verified_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(VALUE_PAGE),
    db
      .from("market_listings")
      .select("seller_minor, settled_at, seller_tx_hash, pay_chain_id")
      .eq("seller_profile_id", profileId)
      .eq("status", "settled")
      .not("seller_tx_hash", "is", null)
      .order("settled_at", { ascending: false })
      .limit(VALUE_PAGE),
    db
      .from("tips")
      .select("id", { count: "exact", head: true })
      .eq("to_id", profileId)
      .is("verified_at", null),
  ]);

  const tips = (tipsRes.data ?? []) as {
    amount: string | null;
    token: string | null;
    chain_id: number | null;
    tx_hash: string | null;
    created_at: string;
  }[];

  /* Grouped by chain and token before anything is added, because summing two
     different assets produces a number with no unit. */
  const groups = new Map<string, { chainId: number | null; token: string; amounts: string[] }>();
  for (const t of tips) {
    const token = (t.token ?? "").toUpperCase();
    if (!token) continue;
    const key = `${t.chain_id ?? "none"}:${token}`;
    const g = groups.get(key) ?? { chainId: t.chain_id, token, amounts: [] };
    g.amounts.push(t.amount ?? "");
    groups.set(key, g);
  }

  let unreadable = 0;
  const tributes: TributeTotal[] = [];
  for (const g of groups.values()) {
    const sum = sumDecimal(g.amounts);
    unreadable += sum.skipped;
    if (sum.counted === 0) continue;
    tributes.push({
      chainId: g.chainId,
      token: g.token,
      amount: sum.total,
      count: sum.counted,
    });
  }
  tributes.sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));

  const sales = (salesRes.data ?? []) as {
    seller_minor: number;
    settled_at: string | null;
    seller_tx_hash: string | null;
    pay_chain_id: number | null;
  }[];

  let bazaarMinor = 0;
  for (const s of sales) bazaarMinor += Number(s.seller_minor) || 0;

  /* The entries a member actually reads, newest first, both kinds interleaved.
     Every one carries the hash that proves it, because "every entry traces to a
     verified event" is only true if a member can follow the trace. */
  const entries: ValueEntry[] = [
    ...tips.map((t) => ({
      kind: "tribute" as const,
      amount: t.amount ?? "",
      unit: (t.token ?? "").toUpperCase(),
      at: t.created_at,
      txHash: t.tx_hash,
      chainId: t.chain_id,
    })),
    ...sales.map((s) => ({
      kind: "bazaar-sale" as const,
      amount: String(Number(s.seller_minor) || 0),
      unit: "usd-minor",
      at: s.settled_at ?? "",
      txHash: s.seller_tx_hash,
      chainId: s.pay_chain_id,
    })),
  ]
    .filter((e) => e.at !== "")
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 50);

  return {
    tributes,
    bazaarMinor,
    bazaarSales: sales.length,
    entries,
    unreadable,
    unverified: unverifiedRes.count ?? 0,
  };
}
