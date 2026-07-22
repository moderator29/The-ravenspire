import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse } from "../_admin";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const now = Date.now();
  const since24h = new Date(now - DAY_MS).toISOString();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();

  const [
    users,
    postsCount,
    reportsOpen,
    liveRooms,
    gloryRows,
    dauRows,
    tipsRows,
    signupRows,
    postDayRows,
  ] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("deleted", false),
    db
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    db
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("status", "live"),
    /* Glory issued is the sum of every citizen's glory, including the unsworn
       whose glory never reaches a house. */
    db.from("profiles").select("glory"),
    /* Distinct actors in the ledger over 24h = DAU. */
    db.from("points_ledger").select("profile_id").gte("created_at", since24h).limit(20000),
    db.from("tips").select("points"),
    db.from("profiles").select("created_at").gte("created_at", since7d).limit(20000),
    db
      .from("posts")
      .select("created_at")
      .eq("deleted", false)
      .gte("created_at", since7d)
      .limit(20000),
  ]);

  const gloryIssued = (gloryRows.data ?? []).reduce(
    (s, r) => s + ((r as { glory: number | null }).glory ?? 0),
    0
  );
  const dau = new Set(
    (dauRows.data ?? []).map((r) => (r as { profile_id: string }).profile_id)
  ).size;
  const revenue = (tipsRows.data ?? []).reduce(
    (s, r) => s + ((r as { points: number | null }).points ?? 0),
    0
  );

  /* Seven-day series (oldest to newest), one bucket per calendar day. */
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(dayKey(new Date(now - i * DAY_MS).toISOString()));
  const signupBuckets: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  const postBuckets: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  for (const r of signupRows.data ?? []) {
    const k = dayKey((r as { created_at: string }).created_at);
    if (k in signupBuckets) signupBuckets[k] += 1;
  }
  for (const r of postDayRows.data ?? []) {
    const k = dayKey((r as { created_at: string }).created_at);
    if (k in postBuckets) postBuckets[k] += 1;
  }

  const { data: recent } = await db
    .from("posts")
    .select("id, body, deleted, created_at, author:author_id (handle, display_name)")
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: audit } = await db
    .from("admin_audit_log")
    .select("id, action, target_type, target_id, created_at, actor:actor_id (handle, display_name)")
    .order("created_at", { ascending: false })
    .limit(10);

  return json({
    stats: {
      users: users.count ?? 0,
      dau,
      posts: postsCount.count ?? 0,
      gloryIssued,
      liveRooms: liveRooms.count ?? 0,
      revenue,
      openReports: reportsOpen.count ?? 0,
    },
    series: {
      days,
      signups: days.map((d) => signupBuckets[d]),
      posts: days.map((d) => postBuckets[d]),
    },
    recent: recent ?? [],
    audit: audit ?? [],
  });
}
