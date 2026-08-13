import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import {
  AGE_MINIMUM_YEARS,
  PENDING_ORDER_GRACE_MINUTES,
  SELF_CAP_RAISE_DELAY_HOURS,
  SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR,
  SPEND_ACKNOWLEDGEMENT_VALID_HOURS,
  SPEND_CAP_DAY_MINOR,
  SPEND_CAP_DAY_WINDOW_HOURS,
  SPEND_CAP_MONTH_MINOR,
  SPEND_CAP_MONTH_WINDOW_HOURS,
  VELOCITY_PAID_ORDERS,
  VELOCITY_WINDOW_MINUTES,
} from "@/lib/commerce/compliance";

/* /api/commerce/compliance: the member's own guardrails, read and set.
 *
 * GET returns everything a member is owed about the limits that apply to them:
 * whether they have passed the age gate, what they have really spent in each
 * window, the realm's ceilings, their own if they set one, and any raise still
 * waiting out its delay. Every number comes from public.commerce_limits_state,
 * which computes spend from real orders. Nothing here is derived on the client,
 * so a member is never shown a limit the server would not actually apply.
 *
 * POST takes one of three actions, and each is deliberately narrow.
 *
 *   attest_age   Records that the member confirmed they are at least eighteen.
 *                It takes no boolean: reaching this action IS the yes. A false
 *                would mean "record that they said no", and storing a refusal
 *                would turn a question somebody may reconsider into a mark on
 *                their account. This is a SELF DECLARATION and nothing in the
 *                product may describe it as verification. Real verification
 *                needs a document or credit check provider, which is a paid
 *                service the realm does not have; the seam is the
 *                age_verified_at column, which nothing writes.
 *
 *   set_self_cap Sets or clears the member's own 30 day ceiling, which may sit
 *                below the realm's and never above. Lowering takes effect at
 *                once. Raising, or clearing, waits a day. That asymmetry is the
 *                only thing separating a self-limit from a slider, and it is
 *                enforced in public.commerce_set_self_cap rather than here,
 *                because a delay a route computes is a delay a route can be
 *                edited to skip.
 *
 *   acknowledge  Records that the member has seen their real 30 day total. The
 *                route CANNOT pass a number: public.commerce_acknowledge_spend
 *                computes the total itself and stores what it computed, so the
 *                row is evidence of what the member was actually shown rather
 *                than of what a client claimed to have shown them.
 *
 * NOBODY WHO WROTE THIS IS A LAWYER and it claims compliance with no law. What
 * each guardrail does and does not cover is set out in lib/commerce/compliance.ts.
 */

export const dynamic = "force-dynamic";

/* The thresholds, echoed to the surface so it can render the same numbers the
   guard enforces rather than a second copy that drifts. */
const POLICY = {
  ageMinimum: AGE_MINIMUM_YEARS,
  dayCapMinor: SPEND_CAP_DAY_MINOR,
  dayWindowHours: SPEND_CAP_DAY_WINDOW_HOURS,
  monthCapMinor: SPEND_CAP_MONTH_MINOR,
  monthWindowHours: SPEND_CAP_MONTH_WINDOW_HOURS,
  acknowledgementThresholdMinor: SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR,
  acknowledgementValidHours: SPEND_ACKNOWLEDGEMENT_VALID_HOURS,
  velocityOrders: VELOCITY_PAID_ORDERS,
  velocityWindowMinutes: VELOCITY_WINDOW_MINUTES,
  selfCapRaiseDelayHours: SELF_CAP_RAISE_DELAY_HOURS,
} as const;

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db.rpc("commerce_limits_state", {
    p_profile_id: profile.id,
    p_day_window_hours: SPEND_CAP_DAY_WINDOW_HOURS,
    p_month_window_hours: SPEND_CAP_MONTH_WINDOW_HOURS,
    p_pending_grace_minutes: PENDING_ORDER_GRACE_MINUTES,
  });

  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return json({ error: "not migrated" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  return json({ policy: POLICY, state: data ?? null });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  /* Generous, because none of these actions moves money and a member fiddling
     with their own limit should not be told to come back later. Tight enough
     that none of them is a write loop. */
  const rl = await rateLimit(profileKey("compliance", profile.id), 30, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    action?: unknown;
    capMinor?: unknown;
  } | null;

  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "attest_age") {
    const { data, error } = await db.rpc("commerce_attest_age", {
      p_profile_id: profile.id,
      p_minimum: AGE_MINIMUM_YEARS,
    });
    if (error) return json({ error: "unavailable" }, 503);
    return json({ ok: true, result: data ?? null });
  }

  if (action === "set_self_cap") {
    /* Null clears the cap, which is a raise to the realm's ceiling and waits
       the same delay as any other raise. Anything else must be a whole number
       of cents: money is an integer here as it is everywhere else. */
    const raw = body?.capMinor;
    let capMinor: number | null;
    if (raw === null || raw === undefined) {
      capMinor = null;
    } else if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
      capMinor = raw;
    } else {
      return json({ error: "A limit must be a whole number of cents" }, 400);
    }

    if (capMinor !== null && capMinor > SPEND_CAP_MONTH_MINOR) {
      /* Refused here as well as in the function, because the function raises
         and a raised exception is a worse answer than a sentence. A cap above
         the realm's would do nothing but mislead: the realm's bites first and
         the member believes they chose a higher one. */
      return json(
        {
          error: "A limit you set cannot be higher than the realm's own limit",
          monthCapMinor: SPEND_CAP_MONTH_MINOR,
        },
        400
      );
    }

    const { data, error } = await db.rpc("commerce_set_self_cap", {
      p_profile_id: profile.id,
      p_cap_minor: capMinor,
      p_delay_hours: SELF_CAP_RAISE_DELAY_HOURS,
      p_realm_cap_minor: SPEND_CAP_MONTH_MINOR,
    });
    if (error) return json({ error: "unavailable" }, 503);
    return json({ ok: true, result: data ?? null });
  }

  if (action === "acknowledge") {
    const { data, error } = await db.rpc("commerce_acknowledge_spend", {
      p_profile_id: profile.id,
      p_month_window_hours: SPEND_CAP_MONTH_WINDOW_HOURS,
      p_pending_grace_minutes: PENDING_ORDER_GRACE_MINUTES,
    });
    if (error) return json({ error: "unavailable" }, 503);
    return json({ ok: true, result: data ?? null });
  }

  return json({ error: "unknown action" }, 400);
}
