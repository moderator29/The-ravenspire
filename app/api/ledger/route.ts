import { requireProfile, json } from "@/lib/auth/server";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { fetchPortfolio } from "@/lib/market/goldrush";

/* C5: The Ledger reads a full multi-chain portfolio for whatever address is
   named, on our paid GoldRush quota. Members only, and metered. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!process.env.GOLDRUSH_API_KEY) return json({ configured: false });

  const rl = await rateLimit(profileKey("ledger", profile.id), 200, 3600);
  if (!rl.ok)
    return json(
      { configured: true, error: "rate_limited", retryAfter: rl.retryAfter },
      429
    );

  const url = new URL(req.url);
  const address = url.searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json({ configured: true, error: "invalid address" }, 400);
  }

  try {
    const portfolio = await fetchPortfolio(address);
    if (!portfolio) return json({ configured: true, error: "unreachable" }, 502);
    return json({
      configured: true,
      items: portfolio.items,
      dust: portfolio.dust,
      totalUsd: portfolio.totalUsd,
      change24hUsd: portfolio.change24hUsd,
      allocations: portfolio.allocations,
    });
  } catch {
    return json({ configured: true, error: "unreachable" }, 502);
  }
}
