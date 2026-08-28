import {
  requireProfile,
  privyAvatarUrl,
  privyWalletAddress,
  json,
} from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";

/* Sync identity from the client's Privy session onto the profile. The server
   side privy.getUser enrichment can come back empty, so the client, which
   already holds the X name and handle, sends them here. We only fill fields
   the profile is missing (or a display name that merely mirrors the handle),
   so a member's own edits are never clobbered.
 *
 * THE WALLET IS NOT ONE OF THOSE FIELDS ANY MORE. It used to be: the client
 * posted wallet_address and, if the profile had none, it was written. Set once
 * and self only, so nobody could overwrite anybody else, but the column is
 * what The Ledger reads, what the scanner hands a model as "your holdings",
 * and what a payout would one day look at, and an account's own claim about
 * which wallet is its own is not evidence of anything. It is now read from
 * Privy against the verified token's user id, which is the same source
 * requireProfile enriches a brand new profile from. A client that still sends
 * the field is simply ignored.
 *
 * B1: THE PORTRAIT IS NOT ONE OF THEM EITHER, AND FOR THE SAME REASON. This
 * route wrote avatar_url from an unchecked client string while /api/profile
 * refused anything outside the realm's media shelf, so the allowlist one
 * route enforced was walked around by the other and any URL could be planted
 * as a member's portrait. It now comes from privyAvatarUrl, keyed on the
 * verified token's user id. Pointing it at the media-shelf predicate instead
 * would have been the smaller change and the wrong one: the value this field
 * exists to carry is an X profile photo, which lives on Twitter's CDN and
 * never on our shelf, so that check would have read as a fix while silently
 * ending the feature. A client that still sends avatar_url is ignored. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C7: metered, because this is not the free read it looks like. A member
     with no wallet on record costs an outbound Privy call on EVERY sync, and
     the client calls this on session restore, so a loop here spends somebody
     else's quota rather than ours. Thirty an hour is far above any real
     session, which syncs a handful of times at most. */
  const rl = await rateLimit(profileKey("profile-sync", profile.id), 30, 3600);
  if (!rl.ok)
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const body = (await req.json().catch(() => null)) as {
    x_handle?: unknown;
    display_name?: unknown;
  } | null;
  if (!body) return json({ error: "bad request" }, 400);

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const xHandle = str(body.x_handle);
  const xName = str(body.display_name);

  const update: Record<string, unknown> = {};

  if (xHandle && !profile.x_handle)
    update.x_handle = xHandle.replace(/^@/, "").slice(0, 40);
  /* Asked for only when the profile still has no wallet, so the ordinary sync
     costs no Privy round trip. Still set once: a member who has linked a
     wallet keeps the one on record. */
  if (!profile.wallet_address) {
    const wallet = await privyWalletAddress(profile.privy_id);
    if (wallet) update.wallet_address = wallet;
  }
  /* Asked for only when the profile still has no portrait, so an ordinary
     sync costs no extra Privy round trip. Still set once: a member who has
     uploaded their own portrait keeps it. */
  if (!profile.avatar_url) {
    const avatar = await privyAvatarUrl(profile.privy_id);
    if (avatar) update.avatar_url = avatar;
  }
  /* Fill the display name from the X name when the profile has none, or when
     it only mirrors the handle (the onboarding fallback). */
  if (
    xName &&
    (!profile.display_name || profile.display_name === profile.handle)
  )
    update.display_name = xName.slice(0, 40);

  if (Object.keys(update).length === 0)
    return json({ ok: true, synced: false });

  const { error } = await db
    .from("profiles")
    .update(update)
    .eq("id", profile.id);
  if (error) return json({ error: "sync failed" }, 500);

  return json({ ok: true, synced: true });
}
