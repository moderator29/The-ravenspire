import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  ANON_VIEWER,
  FEED_TABS,
  loadAuthorPosts,
  loadFeed,
  resolveViewer,
  type FeedTab,
} from "@/lib/social/feed-server";

/* GET /api/feed
 *
 * The Ravenry, read server-side. This route exists because a raven's audience
 * cannot be enforced in the browser: the anon key ships in the bundle, so a
 * client-built filter is a suggestion. The viewer is resolved from the verified
 * Privy bearer token, the follow graph is read from the database, and the
 * audience decision happens in lib/social/feed-server.ts before anything is
 * returned. See migration 20260811120000 for the RLS floor underneath it.
 *
 * Query:
 *   tab    foryou | following | houses | signal | latest   (default foryou)
 *   before ISO timestamp, for the next page
 *   house  House slug, when reading a specific House hall
 *   author profile id, when reading one member's Keep
 *
 * Signed out is a first-class case: it resolves to the anonymous viewer, who
 * sees public ravens only. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* getProfile, not requireProfile: reading the feed must never create a
     profile row, and a bad token simply reads as a logged-out visitor. */
  const profile = await getProfile(req);
  const viewer = profile ? await resolveViewer(db, profile) : ANON_VIEWER;

  const params = new URL(req.url).searchParams;

  const author = params.get("author");
  if (author) {
    const posts = await loadAuthorPosts(db, viewer, author);
    return json({ posts });
  }

  const rawTab = params.get("tab") ?? "foryou";
  const tab = (FEED_TABS as string[]).includes(rawTab)
    ? (rawTab as FeedTab)
    : "foryou";
  const before = params.get("before") ?? undefined;
  const houseSlug = params.get("house");

  const posts = await loadFeed(db, viewer, {
    tab: houseSlug ? "houses" : tab,
    before,
    houseSlug,
  });
  return json({ posts });
}
