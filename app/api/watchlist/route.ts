import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { tradeChainById } from "@/lib/trade/config";
import { profileKey, rateLimit } from "@/lib/rate-limit";

/* The coin watchlist (the bookmark star on Scrying Glass rows and the coin
   page), server-authoritative so a member's starred coins follow them across
   devices instead of living only in one browser's localStorage. A watched
   coin is identified by (chainId, address), not address alone, so the same
   address on two different chains never collides. Members only; all access
   flows through the service-role admin client, matching public.watchlist_items'
   deny-all RLS. */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function cleanAddress(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return ADDRESS_RE.test(s) ? s : null;
}

/* GET /api/watchlist -> every (chainId, address) the member has watched. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: a member's own stars, read on every page load and star render, not a
     per-keystroke surface. 120/hour matches trade:safety's ceiling for the
     same kind of read-heavy-but-human-paced surface. */
  const rl = await rateLimit(profileKey("watchlist:read", profile.id), 120, 3600);
  if (!rl.ok)
    return json(
      { error: "The glass has read enough this hour. Return shortly.", retryAfter: rl.retryAfter },
      429
    );

  const { data, error } = await db
    .from("watchlist_items")
    .select("chain_id, address")
    .eq("profile_id", profile.id);
  if (error) return json({ items: [] });

  const items = (data ?? []).map((r) => ({
    chainId: r.chain_id as number,
    address: r.address as string,
  }));
  return json({ items });
}

/* POST /api/watchlist -> watch a coin. Body: { chainId, address }. Idempotent:
   watching an already-watched coin is not an error. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: a tap on a star, not a per-keystroke action. A real member stars a
     handful of coins a session; this bounds a script hammering writes while
     never touching genuine use, tighter than the read ceiling since a write
     also lands a row. */
  const rl = await rateLimit(profileKey("watchlist:write", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      { error: "You star faster than the ledger can be sealed. Rest a moment.", retryAfter: rl.retryAfter },
      429
    );

  const body = (await req.json().catch(() => null)) as {
    chainId?: number;
    address?: string;
  } | null;

  const chainId = Number(body?.chainId);
  const address = cleanAddress(body?.address);
  if (!Number.isFinite(chainId) || !tradeChainById(chainId))
    return json({ error: "This chain is not tradable." }, 400);
  if (!address) return json({ error: "A valid token address is required." }, 400);

  const { error } = await db
    .from("watchlist_items")
    .upsert(
      { profile_id: profile.id, chain_id: chainId, address },
      { onConflict: "profile_id,chain_id,address" }
    );
  if (error) return json({ error: "Could not watch this coin" }, 500);

  return json({ ok: true });
}

/* DELETE /api/watchlist -> unwatch a coin. Body or query: { chainId, address }.
   Idempotent: unwatching an already-absent coin is not an error. */
export async function DELETE(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const rl = await rateLimit(profileKey("watchlist:write", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      { error: "You star faster than the ledger can be sealed. Rest a moment.", retryAfter: rl.retryAfter },
      429
    );

  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as {
    chainId?: number;
    address?: string;
  } | null;

  const chainId = Number(body?.chainId ?? url.searchParams.get("chainId"));
  const address = cleanAddress(body?.address ?? url.searchParams.get("address"));
  if (!Number.isFinite(chainId) || !tradeChainById(chainId))
    return json({ error: "This chain is not tradable." }, 400);
  if (!address) return json({ error: "A valid token address is required." }, 400);

  await db
    .from("watchlist_items")
    .delete()
    .eq("profile_id", profile.id)
    .eq("chain_id", chainId)
    .eq("address", address);

  return json({ ok: true });
}
