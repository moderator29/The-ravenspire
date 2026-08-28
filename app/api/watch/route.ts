import { getProfile, json } from "@/lib/auth/server";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { WATCH_CHAINS } from "@/lib/tools/watch-types";
import { fetchGoPlus, fetchHoneypot, buildReport } from "@/lib/tools/goplus";

/* C4: the tightest of the public market limits. GoPlus and honeypot.is are
   both keyless and both budget the caller by IP, so every scan the realm
   relays is spent from one shared allowance that belongs to the whole
   platform: an unmetered relay here does not cost money, it costs everyone
   else's ability to scan a contract. Open to visitors, because checking a
   token before you touch it is exactly the thing nobody should have to sign in
   to do. */
export async function GET(req: Request) {
  const profile = await getProfile(req);
  const rl = await rateLimit(
    callerKey("watch", req, profile?.id),
    profile ? 120 : 60,
    3600
  );
  /* B7: { error: "rate_limited", retryAfter } is the machine shape every
     limiter in the realm answers with, and the realm's own words ride in
     `message` beside it rather than in `error`. This route used to put the
     prose in `error` and the machine token in `status`, which is the same two
     facts with the fields swapped, so a client that reads `error` to decide
     what happened saw a sentence here and a token everywhere else. */
  if (!rl.ok)
    return json(
      {
        error: "rate_limited",
        message:
          "The Watch has scanned enough for you this hour. Return shortly.",
        retryAfter: rl.retryAfter,
      },
      429
    );

  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").toLowerCase();
  const chain = url.searchParams.get("chain") ?? "1";

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return json({ error: "invalid address" }, 400);
  }
  // Whitelist the chain: it is interpolated into the upstream path, so an
  // unlisted value could reshape the request. The client only ever sends
  // one of these ids.
  if (!WATCH_CHAINS[chain]) {
    return json({ error: "unsupported chain" }, 400);
  }

  try {
    const [goplus, honeypot] = await Promise.all([
      fetchGoPlus(chain, address),
      fetchHoneypot(chain, address),
    ]);

    if (goplus.status === "rate_limited") {
      return json(
        { error: "The Watch is rate limited. Try again in a moment.", status: "rate_limited" },
        429
      );
    }
    if (goplus.status === "pending") {
      // Fresh, not-yet-indexed token: honeypot.is may still have a live read.
      if (honeypot.reached && (honeypot.isHoneypot || honeypot.simulated)) {
        const report = buildReport(address, chain, {}, honeypot);
        return json(report);
      }
      return json(
        {
          error:
            "This token is too new to have been analysed. The scan is still preparing; try again shortly.",
          status: "pending",
        },
        202
      );
    }
    if (goplus.status === "unreachable" && !honeypot.reached) {
      return json({ error: "The Watch could not reach the wall", status: "unreachable" }, 502);
    }
    if (goplus.status === "not_found" && !honeypot.reached) {
      return json({ error: "No report for this contract", status: "not_found" }, 404);
    }

    const report = buildReport(address, chain, goplus.token ?? {}, honeypot);
    return json(report);
  } catch {
    return json({ error: "The Watch could not reach the wall", status: "unreachable" }, 502);
  }
}
