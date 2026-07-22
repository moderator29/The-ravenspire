import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Earnings + balance data for the FOMO-style profile section.
   Real data only, drawn from three sources:
     - points_ledger (points_delta / glory_delta with timestamps)
     - tips received (tips.points where to_id = member)
     - referral rewards (points_ledger rows whose reason names a referral)
   Privacy gates it: a member who turns PnL visibility OFF hides their
   earnings from every other viewer, while the owner always sees their own.
   Nothing is invented; when a member has earned nothing the numbers are zero
   and the caller renders an honest empty state. */

export const dynamic = "force-dynamic";

interface LedgerRow {
  points_delta: number | null;
  glory_delta: number | null;
  reason: string | null;
  created_at: string;
}

interface TipRow {
  points: number | null;
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

interface WindowBlock {
  /* Cumulative $RSP total across the window, anchored by a baseline point at
     the window's start and a trailing point at "now", so the chart always has
     at least two points and reads as a live window rather than all-time. */
  series: SeriesPoint[];
  /* $RSP earned within the window (may be negative if deltas net down). */
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

/* Group a raw ledger reason into a member-facing earning category. */
function labelForReason(reason: string | null): string {
  if (!reason) return "Other";
  if (reason.startsWith("quest_")) return "Quests";
  if (reason.startsWith("liked_by_")) return "Ravens liked";
  if (reason.startsWith("referral")) return "Referrals";
  switch (reason) {
    case "sent_a_raven":
      return "Ravens sent";
    case "replied":
      return "Replies";
    case "sealed_a_call":
      return "Calls sealed";
    case "war_fought":
      return "War";
    case "took_the_black":
      return "Joined the realm";
    default:
      return "Other";
  }
}

const isReferral = (reason: string | null): boolean =>
  typeof reason === "string" && reason.startsWith("referral");

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

  const [ledgerRes, tipsRes] = await Promise.all([
    db
      .from("points_ledger")
      .select("points_delta, glory_delta, reason, created_at")
      .eq("profile_id", target.id)
      .order("created_at", { ascending: true })
      .limit(2000),
    db
      .from("tips")
      .select("points, created_at")
      .eq("to_id", target.id)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  const ledger = (ledgerRes.data ?? []) as LedgerRow[];
  const tips = (tipsRes.data ?? []) as TipRow[];

  let ledgerPoints = 0;
  let totalGlory = 0;
  let referralRewards = 0;
  const buckets = new Map<string, number>();

  /* Combined, time-ordered earning events feed the cumulative chart. */
  const events: SeriesPoint[] = [];

  for (const row of ledger) {
    const pts = row.points_delta ?? 0;
    const glory = row.glory_delta ?? 0;
    ledgerPoints += pts;
    totalGlory += glory;
    if (isReferral(row.reason)) referralRewards += pts;
    if (pts !== 0) {
      const label = labelForReason(row.reason);
      buckets.set(label, (buckets.get(label) ?? 0) + pts);
      events.push({ t: row.created_at, v: pts });
    }
  }

  let tipsTotal = 0;
  for (const tip of tips) {
    const pts = tip.points ?? 0;
    if (pts !== 0) {
      tipsTotal += pts;
      buckets.set("Tips", (buckets.get("Tips") ?? 0) + pts);
      events.push({ t: tip.created_at, v: pts });
    }
  }

  events.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const series: SeriesPoint[] = [];
  let running = 0;
  for (const e of events) {
    running += e.v;
    series.push({ t: e.t, v: running });
  }

  const grandTotal = ledgerPoints + tipsTotal;

  /* Real windowed views over the same event stream, built from the actual
     points_ledger + tips timestamps. Each drives the chart and headline change
     for its timeframe; sparse windows degrade to an honest flat line. */
  const now = Date.now();
  const windows: Record<string, WindowBlock> = {
    "24h": buildWindow(events, WINDOW_MS["24h"], now),
    "7d": buildWindow(events, WINDOW_MS["7d"], now),
    "30d": buildWindow(events, WINDOW_MS["30d"], now),
  };

  /* Allocation breakdown, largest source first, positives only. Gated behind
     public-positions for non-owners: a member can show earnings totals while
     keeping the source mix private. */
  const breakdown: BreakdownSlice[] = showPositions
    ? [...buckets.entries()]
        .filter(([, v]) => v > 0)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
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
      ledgerPoints,
      tipsTotal,
      referralRewards,
      totalGlory,
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
