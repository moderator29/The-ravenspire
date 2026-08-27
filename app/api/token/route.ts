import { json } from "@/lib/auth/server";
import { lookupToken } from "@/lib/data/tokens";
import { ipKey, rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  /* Public proxy over the shared token lookup and its free upstreams. The
     ceiling is per address and far above honest browsing; it exists so a
     scraper cannot spend the upstream quota the whole realm shares. */
  const rl = await rateLimit(ipKey("token", req), 120, 3600);
  if (!rl.ok)
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const q = new URL(req.url).searchParams.get("q");
  if (!q) return json({ error: "missing q" }, 400);
  const card = await lookupToken(q);
  return json({ card });
}
