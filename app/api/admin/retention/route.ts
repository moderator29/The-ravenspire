import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse } from "../_admin";

/* The metric wall (V2 funding readiness).
 *
 * The questions an investor, or the council itself, actually asks: do members
 * come back, how many are truly active, and how deep does the habit run. The
 * overview counts what exists; this route measures what returns.
 *
 * DEFINITIONS, STATED ONCE AND SHOWN ON THE SURFACE
 * Active on a day means the member earned at least one points ledger entry
 * that UTC day. The ledger only writes against verified acts, so this cannot
 * be inflated from a client, and a lurker who signs in without acting does
 * not count. That is the strict reading, and the honest one.
 *
 * Retention is unbounded ("came back on or after day N"): a member retained
 * at D7 acted at least seven full days after signing up, whenever that was.
 * Bounded windows are the classic chart, but at the realm's current size they
 * read as noise; the unbounded read is stable, still strict about the one
 * thing that matters (they came back), and is labelled as exactly what it is.
 *
 * A member is only eligible for a D-N figure once their account is at least
 * N days old, so young cohorts show "not yet" rather than a fake zero.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const COHORT_WEEKS = 8;
const ACTIVITY_WINDOW_DAYS = 90;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/* Monday 00:00 UTC of the week containing the instant. */
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const dow = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
}

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const now = Date.now();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();
  const sinceActivity = new Date(
    now - ACTIVITY_WINDOW_DAYS * DAY_MS
  ).toISOString();

  /* Four reads, each bounded. The activity window covers every cohort shown
     (eight weeks back) with room for a D30 look. The limits are generous for
     the realm's size today; when they start clipping, this route graduates to
     a SQL rollup, and the numbers stay real either way. */
  const [profileRows, activityRows, callerRows, calls7d] = await Promise.all([
    db.from("profiles").select("id, created_at").limit(20000),
    db
      .from("points_ledger")
      .select("profile_id, created_at")
      .gte("created_at", sinceActivity)
      .limit(50000),
    db
      .from("posts")
      .select("author_id")
      .eq("kind", "call")
      .eq("deleted", false)
      .limit(20000),
    db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("kind", "call")
      .eq("deleted", false)
      .gte("created_at", since7d),
  ]);

  const profiles = (profileRows.data ?? []) as {
    id: string;
    created_at: string;
  }[];

  /* Activity indexed two ways: the set of active days per member for the
     depth read, and the latest act per member for the unbounded retention
     read. One pass builds both. */
  const activeDaysByMember = new Map<string, Set<string>>();
  const lastActByMember = new Map<string, number>();
  const weeklyActive = new Set<string>();
  const monthlyActive = new Set<string>();
  const since7dMs = now - 7 * DAY_MS;
  for (const r of (activityRows.data ?? []) as {
    profile_id: string;
    created_at: string;
  }[]) {
    const t = Date.parse(r.created_at);
    const days = activeDaysByMember.get(r.profile_id) ?? new Set<string>();
    if (t >= since7dMs) days.add(dayKey(t));
    activeDaysByMember.set(r.profile_id, days);
    const prev = lastActByMember.get(r.profile_id) ?? 0;
    if (t > prev) lastActByMember.set(r.profile_id, t);
    if (r.created_at >= since7d) weeklyActive.add(r.profile_id);
    if (r.created_at >= since30d) monthlyActive.add(r.profile_id);
  }

  /* Habit depth: of this week's actives, how many showed up on three or more
     distinct days. The difference between a visit and a habit. */
  let deepWeekly = 0;
  for (const id of weeklyActive) {
    if ((activeDaysByMember.get(id)?.size ?? 0) >= 3) deepWeekly += 1;
  }

  /* Activation: members who have ever sealed a Call. The first Call is the
     product's activation moment; everything before it is spectating. */
  const callers = new Set(
    ((callerRows.data ?? []) as { author_id: string }[]).map((r) => r.author_id)
  );

  /* Weekly signup cohorts, newest first. */
  const thisWeek = weekStartMs(now);
  const cohorts: {
    weekStart: string;
    size: number;
    d1: { eligible: number; returned: number };
    d7: { eligible: number; returned: number };
    d30: { eligible: number; returned: number };
  }[] = [];
  const byWeek = new Map<number, { id: string; signupMs: number }[]>();
  for (const p of profiles) {
    const signupMs = Date.parse(p.created_at);
    const wk = weekStartMs(signupMs);
    if (wk < thisWeek - (COHORT_WEEKS - 1) * 7 * DAY_MS) continue;
    const list = byWeek.get(wk) ?? [];
    list.push({ id: p.id, signupMs });
    byWeek.set(wk, list);
  }
  for (let i = 0; i < COHORT_WEEKS; i++) {
    const wk = thisWeek - i * 7 * DAY_MS;
    const members = byWeek.get(wk) ?? [];
    if (members.length === 0 && i > 0) continue;
    const marks = [1, 7, 30].map((n) => {
      let eligible = 0;
      let returned = 0;
      for (const m of members) {
        if (now < m.signupMs + n * DAY_MS) continue;
        eligible += 1;
        const last = lastActByMember.get(m.id) ?? 0;
        if (last >= m.signupMs + n * DAY_MS) returned += 1;
      }
      return { eligible, returned };
    });
    cohorts.push({
      weekStart: dayKey(wk),
      size: members.length,
      d1: marks[0],
      d7: marks[1],
      d30: marks[2],
    });
  }

  const members = profiles.length;
  return json({
    headline: {
      members,
      weeklyActive: weeklyActive.size,
      monthlyActive: monthlyActive.size,
      activated: callers.size,
      activationPct: members > 0 ? Math.round((callers.size / members) * 100) : 0,
      calls7d: calls7d.count ?? 0,
      callsPerWeeklyActive:
        weeklyActive.size > 0
          ? Math.round(((calls7d.count ?? 0) / weeklyActive.size) * 10) / 10
          : 0,
      habitDepthPct:
        weeklyActive.size > 0
          ? Math.round((deepWeekly / weeklyActive.size) * 100)
          : 0,
    },
    cohorts,
  });
}
