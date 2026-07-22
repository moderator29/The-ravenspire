import { json } from "@/lib/auth/server";
import { fetchPortfolioTrend } from "@/lib/market/goldrush";

/* A real 30-day portfolio value trend for The Ledger sparkline and 7d / 30d
   PnL. Owner reads only; degrades honestly without a GoldRush key. */
export async function GET(req: Request) {
  if (!process.env.GOLDRUSH_API_KEY) return json({ configured: false });
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
