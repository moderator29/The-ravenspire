import { requireProfile, privyWalletAddress, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Sync identity from the client's Privy session onto the profile. The server
   side privy.getUser enrichment can come back empty, so the client, which
   already holds the X name, photo and handle, sends them here. We only fill
   fields the profile is missing (or a display name that merely mirrors the
   handle), so a member's own edits are never clobbered.
 *
 * THE WALLET IS NOT ONE OF THOSE FIELDS ANY MORE. It used to be: the client
 * posted wallet_address and, if the profile had none, it was written. Set once
 * and self only, so nobody could overwrite anybody else, but the column is
 * what The Ledger reads, what the scanner hands a model as "your holdings",
 * and what a payout would one day look at, and an account's own claim about
 * which wallet is its own is not evidence of anything. It is now read from
 * Privy against the verified token's user id, which is the same source
 * requireProfile enriches a brand new profile from. A client that still sends
 * the field is simply ignored. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    x_handle?: unknown;
    display_name?: unknown;
    avatar_url?: unknown;
  } | null;
  if (!body) return json({ error: "bad request" }, 400);

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const xHandle = str(body.x_handle);
  const xName = str(body.display_name);
  const avatar = str(body.avatar_url);

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
  if (avatar && !profile.avatar_url) update.avatar_url = avatar;
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
