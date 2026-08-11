import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* The realm's leaderboards. Real standings only, read straight from profiles:
   top members by Renown, Glory and Points (earnings). Banned accounts, agents
   and un-onboarded shells are excluded so the boards reflect real members.
   Points are the earned balance (they convert to $RSP at TGE); no $RSP figure
   is ever surfaced here. */

const METRICS = {
  /* Accuracy leads deliberately. Renown, Glory and Points are all monotonic
     accumulation measures: because Renown takes greatest(S, 0), a caller with
     no edge at all still climbs on the upside tail of their own variance. A
     board that led with Renown would therefore rank persistence and call it
     skill. Accuracy is a shrunk mean over settled Calls, so it ranks judgment.

     The others stay, because a participation legacy is worth seeing. They are
     just no longer the headline. */
  accuracy: "accuracy",
  renown: "renown",
  glory: "glory",
  points: "points",
} as const;

/* Shrinkage constant, matching the caller board in app/api/calls. A plain sum
   rewards spraying Calls and a plain average lets one lucky Call top the board.
   Dividing by (n + 20) leaves three lucky Calls divided by 23 while a long
   record converges on its true rate. */
const ACCURACY_SHRINK = 20;

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
    : "accuracy";

  if (metric === "accuracy") return accuracyBoard(db);

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

/* The accuracy board. Ranked by a shrunk mean over settled Calls so that
   judgment outranks volume, with the raw rate shown alongside for legibility. */
async function accuracyBoard(db: ReturnType<typeof adminClient>) {
  if (!db) return json({ metric: "accuracy", entries: [] });

  const { data, error } = await db
    .from("posts")
    .select(
      "author_id, call, author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_verified, is_banned, is_agent)"
    )
    .eq("kind", "call")
    .eq("deleted", false)
    .neq("call->>verdict", "open")
    .limit(4000);

  if (error) return json({ metric: "accuracy", entries: [] });

  type Row = {
    author_id: string;
    call: { verdict?: string } | null;
    author: {
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
      house_slug: string | null;
      tier: string | null;
      is_verified: boolean | null;
      is_banned: boolean | null;
      is_agent: boolean | null;
    } | null;
  };

  const tally = new Map<string, { hits: number; total: number; a: Row["author"] }>();
  for (const row of (data ?? []) as unknown as Row[]) {
    const v = row.call?.verdict;
    if (v !== "hit" && v !== "miss") continue;
    if (!row.author || row.author.is_banned || row.author.is_agent) continue;
    if (!row.author.handle) continue;
    const e = tally.get(row.author_id) ?? { hits: 0, total: 0, a: row.author };
    e.total += 1;
    if (v === "hit") e.hits += 1;
    tally.set(row.author_id, e);
  }

  const entries = [...tally.entries()]
    .map(([id, e]) => ({
      id,
      handle: e.a?.handle ?? null,
      display_name: e.a?.display_name ?? null,
      avatar_url: e.a?.avatar_url ?? null,
      house_slug: e.a?.house_slug ?? null,
      tier: e.a?.tier ?? null,
      is_verified: Boolean(e.a?.is_verified),
      hits: e.hits,
      total: e.total,
      hit_rate: e.total > 0 ? e.hits / e.total : 0,
      value: Math.round((e.hits / (e.total + ACCURACY_SHRINK)) * 1000),
    }))
    .sort((x, y) => y.value - x.value)
    .slice(0, 50)
    .map((x, i) => ({ ...x, rank: i + 1 }));

  return json({ metric: "accuracy", entries });
}
