import { requireProfile, json } from "@/lib/auth/server";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { fetchPortfolioTrend } from "@/lib/market/goldrush";

/* A real 30-day portfolio value trend for The Ledger sparkline and 7d / 30d
   PnL. Degrades honestly without a GoldRush key.
   C5: a 30-day historical read is the most expensive call we make on the paid
   quota, so it is members only and metered. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!process.env.GOLDRUSH_API_KEY) return json({ configured: false });

  const rl = await rateLimit(profileKey("ledger_trend", profile.id), 100, 3600);
  if (!rl.ok)
    return json(
      { configured: true, trend: null, retryAfter: rl.retryAfter },
      429
    );

  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json({ configured: true, error: "invalid address" }, 400);
  }
  try {
    const trend = await fetchPortfolioTrend(address);
    return json({ configured: true, trend });
  } catch {
    return json({ configured: true, trend: null });
  }
}
