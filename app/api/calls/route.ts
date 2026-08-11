import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, json } from "@/lib/auth/server";

/* The Calls index.

   Calls are the flagship of the realm and until now had no home: they existed
   only as a post kind inside the feed and a single Signal tab. This route backs
   /calls, the surface where a Call is a spectator event rather than a receipt.

   A Call is stored as a posts row with kind = 'call' and a `call` jsonb column
   carrying { token, address, chain, stance, timeframe, entry_price, verdict,
   settled_price?, settled_at? }.

   Real data only. When the realm has made no Calls yet, every view returns an
   empty list and the surface says so honestly. */

export const dynamic = "force-dynamic";

type View = "live" | "closing" | "trending" | "leaderboard" | "mine";

/* How long each timeframe runs before the verdict job may settle it. Mirrors
   WINDOW_MS in app/api/cron/verdicts/route.ts. */
const WINDOW_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const AUTHOR_SELECT =
  "author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, house_slug, tier, is_agent)";
const CALL_SELECT = `id, author_id, kind, body, call, cashtags, like_count, reply_count, repost_count, view_count, created_at, ${AUTHOR_SELECT}`;

interface CallRow {
  id: string;
  author_id: string;
  call: {
    token?: string;
    stance?: "up" | "down";
    timeframe?: string;
    entry_price?: number;
    verdict?: "open" | "hit" | "miss";
    settled_price?: number;
    settled_at?: string;
  } | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  author: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    house_slug: string | null;
    tier: string;
  } | null;
}

/* When this Call's window closes, in epoch ms. */
function closesAt(row: CallRow): number {
  const window = WINDOW_MS[row.call?.timeframe ?? "24h"] ?? WINDOW_MS["24h"];
  return Date.parse(row.created_at) + window;
}

export async function GET(req: NextRequest) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  const url = new URL(req.url);
  const view = (url.searchParams.get("view") ?? "live") as View;
  const profile = await getProfile(req);

  if (view === "leaderboard") {
    /* The caller board. Ranked by a shrunk mean rather than a raw sum or a raw
       average: a sum rewards spraying Calls, and an average lets one lucky Call
       top the board. Shrinking toward zero with a constant of 20 divides three
       lucky Calls by 23 while letting a long record converge on true skill.

       This scores settled Calls only. An open Call has no outcome to score. */
    const { data, error } = await db
      .from("posts")
      .select(`author_id, call, ${AUTHOR_SELECT}`)
      .eq("kind", "call")
      .eq("deleted", false)
      .neq("call->>verdict", "open")
      .limit(2000);

    if (error) return json({ error: error.message }, 500);

    const byAuthor = new Map<
      string,
      { hits: number; total: number; author: CallRow["author"] }
    >();
    for (const row of (data ?? []) as unknown as CallRow[]) {
      const verdict = row.call?.verdict;
      if (verdict !== "hit" && verdict !== "miss") continue;
      const entry = byAuthor.get(row.author_id) ?? {
        hits: 0,
        total: 0,
        author: row.author,
      };
      entry.total += 1;
      if (verdict === "hit") entry.hits += 1;
      byAuthor.set(row.author_id, entry);
    }

    const SHRINK = 20;
    const callers = [...byAuthor.entries()]
      .map(([id, e]) => ({
        profile_id: id,
        author: e.author,
        hits: e.hits,
        misses: e.total - e.hits,
        total: e.total,
        /* Raw hit rate is shown for legibility, score is what ranks. */
        hit_rate: e.total > 0 ? e.hits / e.total : 0,
        score: e.hits / (e.total + SHRINK),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);

    return json({ view, callers });
  }

  let q = db
    .from("posts")
    .select(CALL_SELECT)
    .eq("kind", "call")
    .eq("deleted", false);

  if (view === "mine") {
    if (!profile) return json({ view, calls: [] });
    q = q.eq("author_id", profile.id);
  } else if (view !== "trending") {
    /* Live and Closing both concern Calls that have not been settled. */
    q = q.eq("call->>verdict", "open");
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(view === "closing" ? 200 : 60);

  if (error) return json({ error: error.message }, 500);
  let rows = (data ?? []) as unknown as CallRow[];

  if (view === "closing") {
    /* Soonest to resolve first, and only ones that have not already lapsed
       past their window waiting on the settlement job. */
    const now = Date.now();
    rows = rows
      .filter((r) => closesAt(r) > now)
      .sort((a, b) => closesAt(a) - closesAt(b))
      .slice(0, 60);
  } else if (view === "trending") {
    /* Engagement against recency, so a busy Call from this morning outranks a
       slightly busier one from last week. */
    const now = Date.now();
    rows = rows
      .map((r) => {
        const ageHours = Math.max(1, (now - Date.parse(r.created_at)) / 3.6e6);
        const engagement = (r.like_count ?? 0) + (r.reply_count ?? 0) * 2;
        return { r, rank: engagement / Math.pow(ageHours, 0.6) };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 40)
      .map((x) => x.r);
  }

  return json({
    view,
    calls: rows.map((r) => ({ ...r, closes_at: closesAt(r) })),
  });
}
