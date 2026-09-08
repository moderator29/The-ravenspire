import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { tradeChainById } from "@/lib/trade/config";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { fetchDexPrice } from "@/lib/data/dex-price";

/* Percent-move alerts: a member can arm "notify me if this moves plus or
   minus X% from where it is now" on a coin they have already starred. Sane
   range only, same reasoning as every other member-set percentage in the
   product (slippage, sell size): too small and ordinary noise fires it
   constantly, too large and it never fires at all. */
const ALERT_PCT_MIN = 1;
const ALERT_PCT_MAX = 90;

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

/* GET /api/watchlist -> every (chainId, address) the member has watched, plus
   that row's alert state if one is armed. alertPct/alertBaselinePrice ride
   along on the same read (they were already selected by profile_id, adding
   two columns costs nothing extra) so a coin page can hydrate its alert
   control from the same call the star already made, rather than a second
   round trip. Both are null on a row with no alert armed. */
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
    .select("chain_id, address, alert_pct, alert_baseline_price")
    .eq("profile_id", profile.id);
  if (error) return json({ items: [] });

  const items = (data ?? []).map((r) => ({
    chainId: r.chain_id as number,
    address: r.address as string,
    alertPct: (r.alert_pct as number | null) ?? null,
    alertBaselinePrice: (r.alert_baseline_price as number | null) ?? null,
  }));
  return json({ items });
}

/* POST /api/watchlist -> watch a coin, and optionally arm, re-arm or disarm
   its percent-move alert in the same call. Body: { chainId, address,
   alertPct? }. Idempotent: watching an already-watched coin is not an error.

   alertPct is optional and three-way:
     - omitted: watch (or leave watched) with whatever alert state already
       exists, unchanged. This is the plain star tap, most calls.
     - a number in [1, 90]: arm or re-arm the alert. The coin's real current
       price is read server side (never taken from the client) and stored as
       alert_baseline_price, the "from where it is now" the member is arming
       against; alert_fired_at is cleared so a stale fire from a previous
       arming never suppresses this one.
     - null: disarm, without unwatching the coin. Clears all three alert
       columns on the existing row. */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: a tap on a star, not a per-keystroke action. A real member stars a
     handful of coins a session; this bounds a script hammering writes while
     never touching genuine use, tighter than the read ceiling since a write
     also lands a row. Arming an alert is the same tap, same ceiling. */
  const rl = await rateLimit(profileKey("watchlist:write", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      { error: "You star faster than the ledger can be sealed. Rest a moment.", retryAfter: rl.retryAfter },
      429
    );

  const body = (await req.json().catch(() => null)) as {
    chainId?: number;
    address?: string;
    alertPct?: number | null;
  } | null;

  const chainId = Number(body?.chainId);
  const address = cleanAddress(body?.address);
  if (!Number.isFinite(chainId) || !tradeChainById(chainId))
    return json({ error: "This chain is not tradable." }, 400);
  if (!address) return json({ error: "A valid token address is required." }, 400);

  const wantsAlert = Object.prototype.hasOwnProperty.call(body ?? {}, "alertPct");
  const alertPct = body?.alertPct;

  if (wantsAlert && alertPct !== null) {
    const pct = Number(alertPct);
    if (
      !Number.isFinite(pct) ||
      pct < ALERT_PCT_MIN ||
      pct > ALERT_PCT_MAX
    )
      return json(
        { error: `alertPct must be between ${ALERT_PCT_MIN} and ${ALERT_PCT_MAX}.` },
        400
      );

    /* The real current price, read here rather than trusted from the client:
       the baseline a percent move is measured against has to be as real as
       the move itself. */
    const price = await fetchDexPrice(chainId, address);
    if (price === null)
      return json(
        { error: "Could not read a real price for this coin right now. Try again shortly." },
        400
      );

    const { error } = await db.from("watchlist_items").upsert(
      {
        profile_id: profile.id,
        chain_id: chainId,
        address,
        alert_pct: pct,
        alert_baseline_price: price,
        alert_fired_at: null,
      },
      { onConflict: "profile_id,chain_id,address" }
    );
    if (error) return json({ error: "Could not arm this alert" }, 500);
    return json({ ok: true, alertPct: pct, alertBaselinePrice: price });
  }

  if (wantsAlert && alertPct === null) {
    /* Disarm without unwatching: clear the alert columns on the existing row.
       A row that does not exist yet has nothing to disarm, which is still a
       success, matching this route's idempotent style throughout. */
    const { error } = await db
      .from("watchlist_items")
      .update({ alert_pct: null, alert_baseline_price: null, alert_fired_at: null })
      .eq("profile_id", profile.id)
      .eq("chain_id", chainId)
      .eq("address", address);
    if (error) return json({ error: "Could not disarm this alert" }, 500);
    return json({ ok: true });
  }

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
