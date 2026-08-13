import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, ipKey } from "@/lib/rate-limit";

/* GET /api/chests/openings  the realm's own openings, newest first. Public.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT JUST A CONVENIENCE.
 *
 * The per-opening endpoint beside this one lets anybody check a draw whose
 * reference they were handed. That is most of the promise, and it still leaves
 * one hole: if the only way to find a reference is to have opened the chest
 * yourself or to be given it by somebody who did, then the only draws ever
 * audited are the ones the house had no reason to fear. A house that cheats on
 * one opening in a thousand would never be caught by members checking their own
 * chests, because the member who was cheated is exactly the one who cannot tell.
 *
 * So the references are published. Anybody can pick an opening they had nothing
 * to do with, at random, and check it. That is the difference between a scheme
 * that constrains the house and one that merely reassures each member privately.
 *
 * WHAT IS PUBLISHED IS THE DRAW, NEVER THE DRAWER. Three fields: the reference,
 * which chest it was, and when. No profile id, no username, no join to
 * profiles, and no way to ask this endpoint for one member's openings. An
 * opening here is an event in the realm's ledger, not an entry in anybody's
 * Hoard. That distinction is why the column list below is explicit and why
 * there is no filter parameter: a `select *` or a member filter would turn an
 * audit log into a surveillance feed, and both are one careless edit away.
 *
 * The residual is honest and worth writing down: on a small realm, an opening's
 * timestamp could in principle be correlated with a member's public activity.
 * That is a real cost and it is a smaller one than an unauditable house, which
 * is the thing this entire subsystem exists to prevent.
 *
 * TODAY IT RETURNS AN EMPTY LIST, and the page says so plainly. Nothing grants
 * a chest entitlement yet and chests_live is off, so no chest has ever been
 * opened in this realm. The page renders that as an empty state rather than a
 * specimen, and this route will start answering the moment the first chest is
 * genuinely opened.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

const LIST_LIMIT = 120;
const LIST_WINDOW_SECONDS = 3600;

/* Enough to pick from without becoming a bulk export of the realm's activity. */
const PAGE = 24;

export async function GET(req: Request) {
  const rl = await rateLimit(
    ipKey("chest-proof-list", req),
    LIST_LIMIT,
    LIST_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  try {
    const { data, error } = await db
      .from("chest_openings")
      .select("id, chest_sku, opened_at")
      /* Settled only, for the same reason as the single-opening route: an
         opening whose seed is not revealed is not yet a proof. */
      .not("server_seed", "is", null)
      .order("opened_at", { ascending: false })
      .limit(PAGE);

    if (error) return json({ error: "unavailable" }, 503);

    /* An empty list is the honest answer today, and it is a 200, not an error.
       "Nothing has been opened yet" is a fact about the realm, not a failure. */
    return json({ openings: data ?? [] });
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return json({ error: "The chests are not ready yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }
}
