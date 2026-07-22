import { json } from "@/lib/auth/server";
import { WATCH_CHAINS } from "@/lib/tools/watch-types";
import { fetchGoPlus, fetchHoneypot, buildReport } from "@/lib/tools/goplus";

export async function GET(req: Request) {
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
