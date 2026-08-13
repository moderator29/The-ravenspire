import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { getFlag } from "@/lib/flags";
import { houseBySlug } from "@/lib/data/houses";
import {
  DAILY_ENDOWMENT_CAP,
  MIN_ENDOWMENT,
  maxEndowmentFor,
  planEndowment,
  splitEndowment,
} from "@/lib/houses/endowment";
import { endowHouseTreasury, endowedToday } from "@/lib/houses/treasury";

/* GET  /api/houses/[slug]/endow   the terms, and what this member could give
 * POST /api/houses/[slug]/endow   commit POINTS from your balance to the House
 *
 * WHAT THE MEMBER SENDS: an amount and a request id. Nothing else. Not the
 * split, not the burn, not the House (that is the path), not their own balance
 * or their own oath. Every one of those is derived on the server, because a
 * client that can name its own split is a client that can endow a thousand
 * POINTS and pool a thousand, and the whole design rests on it pooling less.
 *
 * THE REQUEST ID IS THE MEMBER'S PROTECTION, NOT THE REALM'S. An endowment has
 * no natural idempotency key: the same member may give the same House the same
 * amount twice in a minute and both are real gifts. So the client generates one
 * uuid per gift and carries it through every retry, and
 * public.endow_house_treasury claims it under a unique index before anything
 * moves. Without it, a client retrying a timed out request debits a member
 * twice for one gift and nothing anywhere can tell that apart from a member who
 * meant to give twice.
 *
 * WHY GET IS NOT FLAG GATED and POST is: a member is entitled to read what an
 * endowment would cost them before the chapter opens, the same posture the
 * Bazaar takes with its fee. Committing a balance is the part that waits.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* The terms, as any surface reads them. The floor, the ceiling and the share
   that survives, so the dialog can print exactly what reaches the banner and
   exactly what is destroyed before the member commits. */
function terms() {
  const sample = splitEndowment(DAILY_ENDOWMENT_CAP);
  return {
    min: MIN_ENDOWMENT,
    dailyCap: DAILY_ENDOWMENT_CAP,
    /* Expressed as a worked example rather than as a rate, because "half" is a
       thing a member can check and "5000 bps" is not. */
    example: {
      committed: sample.committed,
      toTreasury: sample.toTreasury,
      destroyed: sample.destroyed,
    },
  };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { slug } = await ctx.params;
  if (!houseBySlug(slug)) return json({ error: "not_found" }, 404);

  const givenToday = await endowedToday(db, profile.id);

  return json({
    open: await getFlag("endowment_live"),
    terms: terms(),
    /* This member's own position. `max` is what the control is bounded by, and
       it is zero rather than a number that moves and then refuses. */
    balance: profile.points,
    givenToday,
    max: maxEndowmentFor(profile.points, givenToday),
    /* Presentation only. The oath that governs the gift is read from
       house_members inside the RPC, under the lock. */
    sworn: profile.house_slug === slug,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  if (!(await getFlag("endowment_live"))) {
    return json({ error: "The treasury is not open to gifts yet." }, 423);
  }

  const { slug } = await ctx.params;
  if (!houseBySlug(slug)) return json({ error: "not_found" }, 404);

  /* The daily cap is the real ration, so this limit exists only to stop a
     hammering client: a member reaching the cap honestly needs at most a
     handful of calls, and one probing the race needs many. */
  const rl = await rateLimit(profileKey("house-endow", profile.id), 30, 3600);
  if (!rl.ok)
    return json(
      { error: "You give faster than the ravens can carry it. Rest a moment.", retryAfter: rl.retryAfter },
      429
    );

  const body = (await req.json().catch(() => null)) as {
    amount?: unknown;
    request_id?: unknown;
  } | null;

  const requestId = typeof body?.request_id === "string" ? body.request_id : "";
  if (!UUID.test(requestId)) {
    return json({ error: "An endowment needs a request id." }, 400);
  }

  /* Refuse before the member commits, with the same arithmetic the dialog
     showed them. This is courtesy and not the guarantee: every one of these
     tests is re-derived inside the RPC under the profile row lock, where two
     concurrent gifts cannot both pass. */
  const givenToday = await endowedToday(db, profile.id);
  const plan = planEndowment({
    raw: body?.amount,
    balance: profile.points,
    committedToday: givenToday,
    sworn: profile.house_slug === slug,
  });
  if (!plan.ok) return json({ error: plan.error, reason: plan.reason }, 400);

  const result = await endowHouseTreasury(db, {
    requestId,
    houseSlug: slug,
    profileId: profile.id,
    amount: plan.split.committed,
  });

  if (!result.ok) return json({ error: result.error }, result.status);

  return json({
    ok: true,
    replayed: result.replayed,
    committed: result.committed,
    toTreasury: result.toTreasury,
    destroyed: result.destroyed,
    balance: result.balance,
    treasury: result.treasury,
  });
}
