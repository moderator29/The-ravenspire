import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Global search across the realm: members, cashtags and posts. Real data only.
   Members only (no anonymous scraping). Private posts are never returned. */

const CASHTAG_RE = /^[a-zA-Z0-9]{1,12}$/;

function escapeLike(s: string): string {
  // Neutralize LIKE wildcards so a query of "%" cannot match everything.
  return s.replace(/[%_\\]/g, "\\$&");
}

export async function GET(req: Request) {
  const viewer = await getProfile(req);
  if (!viewer) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ users: [], posts: [], cashtags: [] });

  const like = `%${escapeLike(q)}%`;
  // For the .or() filter string, also drop characters that would break
  // PostgREST's filter grammar (commas and parentheses split the expression).
  const orLike = `%${escapeLike(q).replace(/[,()]/g, "")}%`;
  const bare = q.replace(/^\$/, "").toLowerCase();

  const [usersRes, postsRes, cashtagRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, handle, display_name, avatar_url, tier, is_verified")
      .eq("is_banned", false)
      .eq("onboarded", true)
      .not("handle", "is", null)
      .or(`handle.ilike.${orLike},display_name.ilike.${orLike}`)
      .limit(8),
    db
      .from("posts")
      .select(
        "id, body, created_at, cashtags, author:profiles!posts_author_id_fkey (handle, display_name, avatar_url, is_verified)"
      )
      .ilike("body", like)
      .eq("deleted", false)
      .or("visibility.eq.public,visibility.is.null")
      .order("created_at", { ascending: false })
      .limit(8),
    CASHTAG_RE.test(bare)
      ? db
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("deleted", false)
          // Cashtags are stored uppercase (see the posts route), so match upper.
          .contains("cashtags", [bare.toUpperCase()])
      : Promise.resolve({ count: 0 }),
  ]);

  type UserRow = {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    tier: string | null;
    is_verified: boolean | null;
  };
  type PostRow = {
    id: string;
    body: string | null;
    created_at: string;
    cashtags: string[] | null;
    author: {
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
      is_verified: boolean | null;
    } | null;
  };

  const users = ((usersRes.data ?? []) as UserRow[]).map((u) => ({
    id: u.id,
    handle: u.handle,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    tier: u.tier,
    isVerified: u.is_verified === true,
  }));

  const posts = ((postsRes.data ?? []) as unknown as PostRow[]).map((p) => ({
    id: p.id,
    body: p.body ? p.body.slice(0, 180) : "",
    createdAt: p.created_at,
    cashtags: Array.isArray(p.cashtags) ? p.cashtags.slice(0, 4) : [],
    author: {
      handle: p.author?.handle ?? null,
      displayName: p.author?.display_name ?? null,
      avatarUrl: p.author?.avatar_url ?? null,
      isVerified: p.author?.is_verified === true,
    },
  }));

  const cashtagCount =
    (cashtagRes as { count?: number | null }).count ?? 0;
  const cashtags =
    CASHTAG_RE.test(bare) && cashtagCount > 0
      ? [{ tag: bare.toUpperCase(), count: cashtagCount }]
      : [];

  return json({ users, posts, cashtags });
}
