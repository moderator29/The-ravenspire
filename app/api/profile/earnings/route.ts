import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  MOVEMENT_CATEGORIES,
  foldStatement,
  type LedgerRow as FoldRow,
} from "@/lib/economy/earnings";

/* Earnings summary for the profile panel, the public half of The Coffers.

   The statement a member reads about themselves lives at /api/coffers and is
   folded by lib/economy/earnings.ts. This route is the smaller, public thing:
   a total and a breakdown for a profile panel, privacy gated, with a windowed
   series the panel charts. It shares the fold rather than deriving a second
   one, because two answers to "what has this member earned" is how the first
   version of this route ended up wrong in four places at once.

   WHAT WAS WRONG, AND IS FIXED HERE

   1. TIPS. It summed `tips.points`, and that column has been null on every row
      since tributes became on chain wallet to wallet transfers. So the Tips
      figure was structurally zero and it was added into the headline total, in
      POINTS, for a payment that is not denominated in POINTS at all. Tributes
      are now reported as a count of PROVEN receipts and are not added to a
      points figure. The amounts, in their own tokens, are on /api/coffers.

   2. REFERRALS. It looked for a reason beginning "referral". Nothing has ever
      written one: a referral pays through `banner_raised`. Every referral
      reward in the realm reported as zero and fell into Other.

   3. STAKES. It added the negative row a staked Call writes at escrow into a
      figure labelled "points earned", so sealing a staked Call made a member's
      lifetime earnings FALL, and the positive row a won stake writes, so
      getting your own points back read as earning them. A stake is a balance
      moving, not an earning, and it is excluded from both directions.

   4. THE BREAKDOWN. Its slices were filtered to positives and its total was
      not, so the percentages beside the slices could not add to a hundred and
      nothing said why. The slices are now the earned figure exactly.

   Real data only, and when a member has earned nothing the numbers are zero
   and the caller renders an honest empty state. */

export const dynamic = "force-dynamic";

interface LedgerRow {
  id: string;
  points_delta: number | null;
  glory_delta: number | null;
  reason: string | null;
  category: string | null;
  created_at: string;
}

interface SeriesPoint {
  t: string;
  v: number;
}

interface BreakdownSlice {
  label: string;
  value: number;
}

/* A ledger row a movement wrote, which is never an earning. Same test the fold
   applies, reading the same exported list, so the series and the totals cannot
   hold different opinions about which rows count. */
function isMovement(category: string | null): boolean {
  return (MOVEMENT_CATEGORIES as readonly string[]).includes(category ?? "");
}

interface WindowBlock {
  /* Cumulative POINTS across the window, anchored by a baseline point at the
     window's start and a trailing point at "now", so the chart always has at
     least two points and reads as a live window rather than all-time.

     POINTS, and the comment said $RSP, which is where the "converts at TGE"
     line on the panel came from. They are a realm score and the product has
     never described a rate between them and any token. */
  series: SeriesPoint[];
  /* POINTS earned within the window (may be negative if deltas net down). */
  delta: number;
  /* Change vs. the balance held at window start. */
  changePct: number;
  /* How many real earning events fell inside the window; 0 means a flat line
     and an honest "quiet" state rather than an invented trend. */
  events: number;
}

const WINDOW_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/* Slice a windowed cumulative series from the raw, time-ordered delta events.
   The full running total is preserved so a window that starts mid-history
   opens at the correct baseline instead of zero. Nothing is invented: a window
   with no events collapses to a flat baseline -> now line. */
function buildWindow(events: SeriesPoint[], ms: number, now: number): WindowBlock {
  const start = now - ms;
  let running = 0;
  let baseline = 0;
  const pts: SeriesPoint[] = [];
  for (const e of events) {
    const t = Date.parse(e.t);
    running += e.v;
    if (t <= start) baseline = running;
    else pts.push({ t: e.t, v: running });
  }
  const startIso = new Date(start).toISOString();
  const nowIso = new Date(now).toISOString();
  const series: SeriesPoint[] = [{ t: startIso, v: baseline }, ...pts];
  if (pts.length === 0 || Date.parse(pts[pts.length - 1].t) < now) {
    series.push({ t: nowIso, v: running });
  }
  const delta = running - baseline;
  const changePct =
    baseline !== 0 ? (delta / baseline) * 100 : delta > 0 ? 100 : 0;
  return { series, delta, changePct, events: pts.length };
}

/* A raven a referral raised pays through `banner_raised`, not through anything
   named "referral", and this is the only place that fact is asserted outside
   the fold. Kept as one predicate so the referral figure and the Banners slice
   can never disagree about which rows are referral rewards. */
const REFERRAL_REASONS = new Set(["banner_raised", "banner_answered"]);

const isReferral = (reason: string | null): boolean =>
  reason !== null && REFERRAL_REASONS.has(reason);

function privacyFlag(settings: unknown, key: string): boolean {
  /* Default ON: a member is only hidden when they explicitly set it false. */
  if (settings && typeof settings === "object") {
    const privacy = (settings as Record<string, unknown>).privacy;
    if (privacy && typeof privacy === "object") {
      const val = (privacy as Record<string, unknown>)[key];
      if (typeof val === "boolean") return val;
    }
  }
  return true;
}

function readThesis(settings: unknown): string | null {
  if (settings && typeof settings === "object") {
    const bucket = (settings as Record<string, unknown>).profile;
    if (bucket && typeof bucket === "object") {
      const t = (bucket as Record<string, unknown>).thesis;
      if (typeof t === "string" && t.trim()) return t.trim();
    }
  }
  return null;
}

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "missing id" }, 400);

  /* The viewer is optional: anonymous readers see public fields only. */
  const viewer = await getProfile(req);

  const { data: target, error: targetErr } = await db
    .from("profiles")
    .select(
      "id, handle, tier, renown, glory, wallet_address, settings, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (targetErr || !target) return json({ error: "not found" }, 404);

  const isOwner = viewer?.id === target.id;
  const pnlVisible = privacyFlag(target.settings, "pnlVisible");
  const publicPositions = privacyFlag(target.settings, "publicPositions");
  const canSeePnl = isOwner || pnlVisible;
  const showPositions = isOwner || publicPositions;

  /* Public fields anyone may see: reputation, join date, call record, crests.
     These already surface through the public profile and its tabs. */
  const [callsRes, crestsRes, referralRes] = await Promise.all([
    db
      .from("posts")
      .select("call")
      .eq("author_id", target.id)
      .eq("kind", "call")
      .eq("deleted", false)
      .limit(1000),
    db
      .from("user_crests")
      .select("crest_slug", { count: "exact", head: true })
      .eq("profile_id", target.id),
    db
      .from("referrals")
      .select("profile_id", { count: "exact", head: true })
      .eq("referrer_id", target.id)
      .eq("activated", true),
  ]);

  let callsWon = 0;
  let callsLost = 0;
  let callsOpen = 0;
  for (const row of (callsRes.data ?? []) as { call: { verdict?: string } | null }[]) {
    const verdict = row.call?.verdict;
    if (verdict === "hit") callsWon += 1;
    else if (verdict === "miss") callsLost += 1;
    else callsOpen += 1;
  }

  const publicBlock = {
    handle: target.handle as string | null,
    joinDate: target.created_at as string,
    renown: (target.renown as number) ?? 0,
    glory: (target.glory as number) ?? 0,
    tier: target.tier as string,
    callsWon,
    callsLost,
    callsOpen,
    crestCount: crestsRes.count ?? 0,
    referralCount: referralRes.count ?? 0,
    thesis: readThesis(target.settings),
  };

  /* When PnL is hidden from this viewer, stop here: no earnings, no chart,
     no balance, no wallet address. The owner never reaches this branch. */
  if (!canSeePnl) {
    return json({
      visible: false,
      isOwner,
      showPositions: false,
      public: publicBlock,
    });
  }

  const [ledgerRes, tributesRes] = await Promise.all([
    db
      .from("points_ledger")
      .select("id, points_delta, glory_delta, reason, category, created_at")
      .eq("profile_id", target.id)
      .order("created_at", { ascending: true })
      .limit(2000),
    /* PROVEN receipts only. An unverified tribute is a claim somebody made
       about a transaction, and counting one would let anybody inflate their own
       public record by posting a hash. verifyTribute reads it off the chain;
       until it has, the row is not a payment. */
    db
      .from("tips")
      .select("id", { count: "exact", head: true })
      .eq("to_id", target.id)
      .not("verified_at", "is", null),
  ]);

  const ledger = (ledgerRes.data ?? []) as LedgerRow[];

  /* One fold, shared with /api/coffers. Stakes and endowments are excluded from
     earnings in both directions, the breakdown is the earned figure exactly,
     and a duplicated row across a page boundary is counted once. */
  const statement = foldStatement(
    ledger.map(
      (r): FoldRow => ({
        id: r.id,
        points_delta: r.points_delta ?? 0,
        glory_delta: r.glory_delta ?? 0,
        reason: r.reason ?? "",
        category: r.category,
        created_at: r.created_at,
      })
    )
  );

  let referralRewards = 0;
  /* The chart's event stream. Movement rows are deliberately absent: a chart of
     "what you have earned" that dips by five hundred the moment somebody stakes
     a Call is describing something other than earning. */
  const events: SeriesPoint[] = [];

  for (const row of ledger) {
    const pts = row.points_delta ?? 0;
    if (isReferral(row.reason)) referralRewards += pts;
    if (pts !== 0 && !isMovement(row.category)) {
      events.push({ t: row.created_at, v: pts });
    }
  }

  events.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const series: SeriesPoint[] = [];
  let running = 0;
  for (const e of events) {
    running += e.v;
    series.push({ t: e.t, v: running });
  }

  /* Earned minus spent, and nothing else. Not the balance, which stakes and
     endowments also move, and never a tribute, which is not denominated in
     POINTS and was being added in as a structural zero. */
  const grandTotal = statement.earned - statement.spent;

  /* Real windowed views over the same event stream, built from the actual
     points_ledger timestamps. Each drives the chart and headline change for its
     timeframe; sparse windows degrade to an honest flat line. */
  const now = Date.now();
  const windows: Record<string, WindowBlock> = {
    "24h": buildWindow(events, WINDOW_MS["24h"], now),
    "7d": buildWindow(events, WINDOW_MS["7d"], now),
    "30d": buildWindow(events, WINDOW_MS["30d"], now),
  };

  /* Largest source first, positives only, and now it genuinely sums to the
     headline: the slices are the earned figure split by stream. Gated behind
     public-positions for non-owners, so a member can show a total while keeping
     the source mix private. */
  const breakdown: BreakdownSlice[] = showPositions
    ? statement.streams
        .filter((s) => s.points > 0)
        .map((s) => ({ label: s.label, value: s.points }))
    : [];

  const firstEarnedAt = events.length ? events[0].t : null;
  const lastEarnedAt = events.length ? events[events.length - 1].t : null;

  return json({
    visible: true,
    isOwner,
    showPositions,
    public: publicBlock,
    earnings: {
      grandTotal,
      ledgerPoints: statement.earned - statement.spent,
      /* A count of proven tributes, never a POINTS figure. The amounts, in the
         tokens they arrived in, are on /api/coffers where they can be shown in
         their own units instead of folded into a score. */
      tributeCount: tributesRes.count ?? 0,
      referralRewards,
      totalGlory: statement.glory,
      /* Balance movements, reported rather than folded into earnings. */
      staked: statement.stakes.staked,
      stakeNet: statement.stakes.net,
      givenToHouse: statement.given,
      series,
      windows,
      breakdown,
      firstEarnedAt,
      lastEarnedAt,
    },
    /* Wallet address is returned to the owner only, so the client can read a
       live balance. It is never exposed to other viewers. */
    walletAddress: isOwner ? ((target.wallet_address as string | null) ?? null) : null,
  });
}
