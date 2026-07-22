import { json } from "@/lib/auth/server";
import { fetchPortfolio } from "@/lib/market/goldrush";

export async function GET(req: Request) {
  if (!process.env.GOLDRUSH_API_KEY) return json({ configured: false });

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
