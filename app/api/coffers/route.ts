import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { getFlag } from "@/lib/flags";
import { loadPointsSide, loadValueSide } from "@/lib/economy/coffers";
import { reconciliationLine } from "@/lib/economy/earnings";
import { REVENUE_STREAMS } from "@/lib/economy/revenue";

/* GET /api/coffers
 *
 * A member's whole earnings record, reconciled, and nobody else's.
 *
 * OWNER ONLY, WITH NO VIEWER PARAMETER AT ALL. The surface this replaces took
 * an `id` and served anybody's earnings to anybody, gated by a privacy flag
 * that defaults to on. That is defensible for a public profile panel showing a
 * total. It is not defensible here, because this route returns the
 * reconciliation between a member's ledger and their balance, the transaction
 * hashes of every payment they have received, and the state of their open
 * stakes. There is no id in the query string, so there is no accidental way to
 * widen it later: the subject is the bearer token and only the bearer token.
 *
 * THE TERMS ARE PART OF THE PAYLOAD. A member reading what they earned is
 * entitled to read what the realm pays and what it keeps, and to read it in the
 * same breath. REVENUE_STREAMS is the register, including the streams that pay
 * nothing and the sentence saying why (lib/economy/revenue.ts).
 *
 * SEALED BY coffers_live, and the seal answers 423 rather than 404 so a member
 * is told the chapter is sealed rather than that it does not exist.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  if (!(await getFlag("coffers_live"))) {
    return json({ error: "The Coffers are sealed." }, 423);
  }

  /* Three ledger reads and two aggregates per call, so this is metered like a
     read-heavy surface rather than like a page. Generous for a member watching
     their own statement, closed to a loop pulling it. */
  const rl = await rateLimit(profileKey("coffers", profile.id), 120, 3600);
  if (!rl.ok)
    return json(
      { error: "Reading the Coffers faster than they fill. Rest a moment.", retryAfter: rl.retryAfter },
      429
    );

  const [points, value] = await Promise.all([
    loadPointsSide(db, profile.id),
    loadValueSide(db, profile.id),
  ]);

  return json({
    /* THE POINTS SIDE. A realm score, never money, never quoted as an amount
       of anything, and never described as convertible. */
    points: {
      balance: points.balance,
      glory: points.glory,
      earned: points.statement.earned,
      spent: points.statement.spent,
      given: points.statement.given,
      streams: points.statement.streams,
      stakes: {
        ...points.statement.stakes,
        /* From call_stakes rather than from the ledger: a burn writes no ledger
           row, so these two facts are not derivable from it. */
        open: points.openStake,
        openCalls: points.openCalls,
        burned: points.burnedStake,
      },
      events: points.statement.events,
      firstAt: points.statement.firstAt,
      lastAt: points.statement.lastAt,
      reconciliation: points.reconciliation,
      reconciliationLine: reconciliationLine(points.reconciliation),
    },
    /* THE VALUE SIDE. Money that has already reached the member's own wallet,
       proven on chain. There is no balance here and no claim action, because
       the realm is not holding anything to be claimed. */
    value: {
      tributes: value.tributes,
      bazaarMinor: value.bazaarMinor,
      bazaarSales: value.bazaarSales,
      entries: value.entries,
      unreadable: value.unreadable,
      unverified: value.unverified,
    },
    /* The terms. Rendered verbatim, including every stream that pays nothing. */
    streams: REVENUE_STREAMS,
  });
}
