import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { prepareCall, type CallInput } from "@/lib/calls/create";
import { peerBaselineFor } from "@/lib/calls/peers";
import { callerRecordFor } from "@/lib/calls/record";
import { discussionFor, similarCalls } from "@/lib/calls/similar";

/* The difficulty preview (V2 section 9.1).

   "pi_0 is computed and frozen at Call time, and shown to the member before
   they commit." That sentence is the whole reason Calls are a skill game rather
   than a lottery, and until now nothing in the product showed it.

   This route seals nothing. It runs exactly the same server path a real Call
   runs, prepareCall, and returns the difficulty it produced instead of writing
   a row. Running the real path rather than a client side approximation is the
   point: the number a member is shown here is the number their Call is sealed
   with, because it is computed by the same function from the same live price
   and the same trailing volatility. A client side estimate would drift, and a
   member would be scored against a difficulty they were never shown.

   Nothing here is trusted from the client, and nothing here is banked. */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded) return json({ error: "Finish onboarding first" }, 403);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* A preview costs a live price lookup and a volatility read against two free
     external APIs, and the composer can ask for one on every keystroke it is
     wired to. Metered per account, shared across instances. */
  const rl = await rateLimit(profileKey("call-preview", profile.id), 120, 3600);
  if (!rl.ok) {
    return json(
      {
        error: "The scales need a moment. Try again shortly.",
        retryAfter: rl.retryAfter,
      },
      429
    );
  }

  const body = (await req.json().catch(() => null)) as CallInput | null;
  if (!body) return json({ error: "bad request" }, 400);

  const draft = await prepareCall(db, profile.id, body);
  if (!draft.ok) return json({ error: draft.error }, draft.status);

  const call = draft.call;

  /* Community consensus, before the Call is even made: how many independent
     members have already Called this exact claim, over this window, in this
     threshold band. House-mates and the member's own Calls are excluded by
     peers.ts, so this is a crowd rather than a chorus. */
  /* Three free reads that need no model at all (V2 section 10). The member's
     own record and calibration are arithmetic over Calls they already settled,
     similarity is an exact structured match on the pinned subject, and the
     discussion count is one indexed count over cashtags already stored. Asking
     a model for any of them would be paying it to invent numbers the realm can
     simply read. They ride on this request because the composer already makes
     it, so the composer gains all three for nothing. */
  const [peers, record, similar, discussion] = await Promise.all([
    peerBaselineFor(db, {
      call,
      authorId: profile.id,
      houseSlug: profile.house_slug,
      createdAt: new Date().toISOString(),
    }),
    callerRecordFor(db, { authorId: profile.id, call }),
    similarCalls(db, { call, viewerId: profile.id, limit: 6 }),
    discussionFor(db, call.token),
  ]);

  const peerMean =
    peers.confidences.length > 0
      ? peers.confidences.reduce((a, b) => a + b, 0) / peers.confidences.length
      : null;

  return json({
    ok: true,
    preview: {
      token: call.token ?? null,
      stance: call.stance ?? "up",
      timeframe: call.timeframe ?? "24h",
      threshold: call.threshold ?? 0,
      category: call.category ?? "markets",
      resolver: call.resolver ?? "price",
      entry_price: call.entry_price ?? null,
      pi_0: call.pi_0 ?? null,
      sigma: call.sigma ?? null,
      claim: call.claim ?? null,
      peers: {
        count: peers.confidences.length,
        eligible: peers.eligible,
        mean_confidence: peerMean,
      },
      record,
      similar,
      discussion,
    },
  });
}
