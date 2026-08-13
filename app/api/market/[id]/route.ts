import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import { marketGate } from "@/lib/commerce/market-config";

/* DELETE /api/market/[id]: withdraw a listing.
 *
 * A seller may take their card off the board at any time, with one exception,
 * and the exception is the whole of the difficulty: not out from under a buyer
 * who is mid-purchase. A reservation that is live, or that has taken a payment
 * leg at any point, holds the listing, because the buyer may already have
 * signed a transfer against it. A reservation that lapsed with nothing paid is
 * an abandoned intent rather than a buyer, and the card comes home.
 *
 * Nothing here moves a card and nothing here moves money. Withdrawing a
 * listing is deleting an intent: the copy never left the seller's hands in the
 * first place, which is the point of the whole design.
 *
 * DELETE rather than a POST to a /cancel path, because this genuinely removes
 * the listing from the board and the method says so. The row survives as
 * history, which is the ledger's business rather than the caller's.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANCEL_LIMIT = 60;
const CANCEL_WINDOW_SECONDS = 3600;

const REFUSAL: Record<string, { message: string; status: number }> = {
  no_such_listing: { message: "No such listing", status: 404 },
  /* Somebody else's listing reads as not found rather than as forbidden. It is
     the truth from where the caller stands, and it does not confirm that a
     listing they have no business with exists. */
  not_yours: { message: "No such listing", status: 404 },
  already_settled: { message: "That card has already been sold", status: 409 },
  reserved_now: {
    message:
      "Somebody is buying that card right now. You can withdraw it if their hold lapses",
    status: 409,
  },
  payment_in_flight: {
    message:
      "A buyer has already paid part of that trade, so it has to finish. It will settle as soon as their payment is complete",
    status: 409,
  },
};

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const gate = await marketGate();
  if (!gate.open) return json({ error: gate.reason }, gate.status);

  const rl = await rateLimit(
    profileKey("market-cancel", profile.id),
    CANCEL_LIMIT,
    CANCEL_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const { id } = await ctx.params;
  if (!UUID.test(id)) return json({ error: "No such listing" }, 404);

  const { data, error } = await db.rpc("market_cancel", {
    p_profile_id: profile.id,
    p_listing_id: id,
  });

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return json({ error: "The Bazaar has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const verdict = data as { ok?: boolean; error?: string; already?: boolean } | null;
  if (!verdict?.ok) {
    const known = verdict?.error ? REFUSAL[verdict.error] : undefined;
    if (known) return json({ error: known.message }, known.status);
    return json({ error: "unavailable" }, 503);
  }

  return json({ cancelled: true, already: verdict.already === true });
}
