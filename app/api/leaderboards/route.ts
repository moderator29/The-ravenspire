import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* The realm's leaderboards. Real standings only, read straight from profiles:
   top members by Renown, Glory and Points (earnings). Banned accounts, agents
   and un-onboarded shells are excluded so the boards reflect real members.
   Points are the earned balance (they convert to $RSP at TGE); no $RSP figure
   is ever surfaced here. */

const METRICS = {
  renown: "renown",
  glory: "glory",
  points: "points",
} as const;

type Metric = keyof typeof METRICS;

export async function GET(req: Request) {
  // Read-only board; a viewer must be a member but we do not create profiles.
  const viewer = await getProfile(req);
  if (!viewer) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const raw = new URL(req.url).searchParams.get("metric") ?? "renown";
  const metric: Metric = (Object.keys(METRICS) as Metric[]).includes(
    raw as Metric
  )
    ? (raw as Metric)
    : "renown";
  const column = METRICS[metric];

  const { data, error } = await db
    .from("profiles")
    .select(
      "id, handle, display_name, avatar_url, house_slug, tier, renown, glory, points, is_verified"
    )
    .eq("is_banned", false)
    .eq("is_agent", false)
    .eq("onboarded", true)
    .not("handle", "is", null)
    .order(column, { ascending: false })
    .limit(50);

  if (error) return json({ metric, entries: [] });

  type Row = {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    house_slug: string | null;
    tier: string | null;
    renown: number | null;
    glory: number | null;
    points: number | null;
    is_verified: boolean | null;
  };

  const entries = ((data ?? []) as Row[]).map((p, i) => ({
    rank: i + 1,
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    houseSlug: p.house_slug,
    tier: p.tier,
    isVerified: p.is_verified === true,
    value: Number(p[column] ?? 0),
    isViewer: p.id === viewer.id,
  }));

  return json({ metric, entries });
}
