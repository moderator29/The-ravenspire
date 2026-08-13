import { json, requireProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { currentMuster } from "@/lib/realm/appointments";
import { claimMuster, musterState } from "@/lib/realm/muster";

/* THE MUSTER: the realm's daily window.
 *
 * GET   the window, and this member's vigil.
 * POST  claim the day. Refuses outside the window, refuses twice in a day.
 *
 * WHY THE CLIENT NAMES NOTHING
 * The request body is empty and stays empty. The client does not say which
 * window it thinks is open, what day it thinks it is, or what it thinks it is
 * owed, because every one of those is a number a member could change. The
 * server reads its own clock, decides the window, decides the day, and
 * public.claim_muster decides the payment. The single most predictable way to
 * build a broken daily reward is to let the browser tell the server what time
 * it is, and a bounded window makes that failure worth real money.
 *
 * WHY A LATE CLAIM IS A 409 AND NOT A 403
 * "You are outside the window" and "you already mustered today" are both
 * conflicts with the state of the world rather than refusals of permission,
 * and the surface needs to tell them apart to say something useful. Both carry
 * the window back so the member is told when to return instead of just being
 * told no. */

export const dynamic = "force-dynamic";

/* Generous, because this is one row read behind a verified session and the
   surface polls it when the app opens. Tight enough that nobody scripts it. */
const READ_LIMIT = 60;
const READ_WINDOW_S = 60;

/* A claim can succeed at most once a day by construction, so this exists only
   to stop a client hammering the RPC. Twenty is far past any honest use and
   far below anything that would cost the database. */
const CLAIM_LIMIT = 20;
const CLAIM_WINDOW_S = 3600;

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const rl = await rateLimit(
    profileKey("muster-read", profile.id),
    READ_LIMIT,
    READ_WINDOW_S
  );
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  return json(await musterState(db, profile.id));
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const rl = await rateLimit(
    profileKey("muster-claim", profile.id),
    CLAIM_LIMIT,
    CLAIM_WINDOW_S
  );
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  /* One `now` for the whole request. Reading the clock twice, once to check
     the window and once to derive the claim day, would let a request that
     arrived at 02:59:59.999 check against one window and settle against the
     next day. */
  const now = new Date();

  const open = currentMuster(now);
  if (!open) {
    return json(
      {
        error: "The Muster is not called right now.",
        reason: "window_shut",
        muster: await musterState(db, profile.id, now),
      },
      409
    );
  }

  const claim = await claimMuster(db, profile.id, now);
  if (!claim) return json({ error: "claim_failed" }, 500);

  if (!claim.claimed) {
    return json(
      {
        error:
          claim.reason === "already_claimed"
            ? "You have already answered today's Muster."
            : "The Muster could not be claimed.",
        reason: claim.reason ?? "refused",
        muster: await musterState(db, profile.id, now),
      },
      409
    );
  }

  /* Report what was actually granted alongside what the vigil was worth. A
     member whose day's social allowance is already spent is paid nothing, and
     that is the honest outcome rather than a failure: they have already earned
     their day. The surface says so in words rather than showing a zero. */
  return json({
    ok: true,
    vigil: claim.streak,
    best: claim.best,
    offered: claim.offered,
    glory: claim.glory,
    capped: claim.capped,
    muster: await musterState(db, profile.id, now),
  });
}
