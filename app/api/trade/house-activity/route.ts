import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { tradeChainById } from "@/lib/trade/config";

/* GET /api/trade/house-activity?chainId=&address= -> which real Houses have
   members trading this coin, and how many. Members only. Reads the same
   verified realm trade feed /api/trade/record does (RealmTrades), joined in
   application code against house_members: trades and house_members each
   reference profiles.id but have no direct foreign key to each other, so
   PostgREST cannot embed one through the other and this is two plain
   queries plus an in-memory group-by instead of one join. Real data only:
   an unverified trade never counts here, matching the realm feed's own
   verified_at filter, and a coin nobody in a House has traded returns an
   empty list rather than a fabricated "no activity yet" figure of merit. */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/* A week, not "ever": this answers "who is trading this now", and a House
   that bought once in month one should not still read as active today. */
const WINDOW_MS = 7 * 24 * 3600 * 1000;
/* Bounds the query cost regardless of how popular a coin gets; recent trades
   matter far more than a complete count for this read. */
const TRADE_SAMPLE = 300;
const MAX_HOUSES = 4;

interface TradeRow {
  profile_id: string;
}

interface MemberRow {
  profile_id: string;
  house_slug: string;
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: one read per coin a member opens, same shape and ceiling as the
     sibling /api/trade/safety read. */
  const rl = await rateLimit(
    profileKey("trade:house-activity", profile.id),
    120,
    3600
  );
  if (!rl.ok)
    return json({ houses: [], error: "Too many reads this hour." }, 429);

  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chainId"));
  const address = (url.searchParams.get("address") ?? "").trim().toLowerCase();

  if (!Number.isFinite(chainId) || !tradeChainById(chainId))
    return json({ error: "This chain is not tradable." }, 400);
  if (!ADDRESS_RE.test(address))
    return json({ error: "A valid token address is required." }, 400);

  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const { data: trades, error } = await db
    .from("trades")
    .select("profile_id")
    .eq("chain_id", chainId)
    .or(`buy_contract.eq.${address},sell_contract.eq.${address}`)
    .not("verified_at", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(TRADE_SAMPLE);

  if (error || !trades || trades.length === 0) return json({ houses: [] });

  const rows = trades as unknown as TradeRow[];
  const profileIds = Array.from(new Set(rows.map((t) => t.profile_id)));

  const { data: members } = await db
    .from("house_members")
    .select("profile_id, house_slug")
    .in("profile_id", profileIds);

  if (!members || members.length === 0) return json({ houses: [] });

  const houseOfProfile = new Map(
    (members as unknown as MemberRow[]).map(
      (m) => [m.profile_id, m.house_slug] as const
    )
  );

  const traderSets = new Map<string, Set<string>>();
  const tradeCounts = new Map<string, number>();
  for (const t of rows) {
    const slug = houseOfProfile.get(t.profile_id);
    if (!slug) continue;
    tradeCounts.set(slug, (tradeCounts.get(slug) ?? 0) + 1);
    if (!traderSets.has(slug)) traderSets.set(slug, new Set());
    traderSets.get(slug)?.add(t.profile_id);
  }

  const houses = Array.from(traderSets.entries())
    .map(([slug, set]) => ({
      slug,
      traderCount: set.size,
      tradeCount: tradeCounts.get(slug) ?? 0,
    }))
    .sort(
      (a, b) => b.traderCount - a.traderCount || b.tradeCount - a.tradeCount
    )
    .slice(0, MAX_HOUSES);

  return json({ houses });
}
