import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { askRaven, ravenEnabled } from "@/lib/ai/raven";

/* The AI Account Scanner: a personal read of the MEMBER'S OWN account by a real
   LLM (the Herald's mind) reasoning over the member's real data only, never
   anyone else's private data. It gathers the owner's standing, their posting
   record and, where a wallet is linked and the lens is configured, their live
   holdings, then asks for an honest briefing of strengths, risks and next
   moves. Real data only: every figure handed to the model is fetched here; the
   model is told never to invent a number.

   Rate-limited per member because the mind costs real coin. */

const usage = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 3600_000;
const MAX_PER_WINDOW = 6;

interface WalletHolding {
  symbol: string;
  quoteUsd: number;
}

async function walletSnapshot(
  address: string
): Promise<{ totalUsd: number | null; top: WalletHolding[] } | null> {
  const keyId = process.env.GOLDRUSH_API_KEY;
  if (!keyId) return null;
  try {
    const res = await fetch(
      `https://api.covalenthq.com/v1/eth-mainnet/address/${address}/balances_v2/?key=${keyId}`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: {
        items?: Array<{
          contract_ticker_symbol?: string | null;
          quote?: number | null;
        }>;
      };
    };
    const items = body.data?.items ?? [];
    let totalUsd = 0;
    for (const it of items) if (typeof it.quote === "number") totalUsd += it.quote;
    const top = items
      .filter((it) => (it.contract_ticker_symbol ?? "").length > 0)
      .sort((a, b) => (b.quote ?? 0) - (a.quote ?? 0))
      .slice(0, 6)
      .map((it) => ({
        symbol: (it.contract_ticker_symbol ?? "?").toUpperCase(),
        quoteUsd: typeof it.quote === "number" ? it.quote : 0,
      }));
    return { totalUsd: items.length ? totalUsd : null, top };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!ravenEnabled())
    return json({ error: "The Oracle sleeps: its mind is not configured." }, 503);

  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const now = Date.now();
  const u = usage.get(profile.id);
  if (!u || now - u.windowStart > WINDOW_MS) {
    usage.set(profile.id, { count: 1, windowStart: now });
  } else if (u.count >= MAX_PER_WINDOW) {
    return json({ error: "The Oracle has read you enough this hour. Return later." }, 429);
  } else {
    u.count += 1;
  }

  // Owner's own posts (real engagement only).
  const { data: posts } = await db
    .from("posts")
    .select("body, cashtags, like_count, reply_count, repost_count, view_count, created_at")
    .eq("author_id", profile.id)
    .eq("deleted", false)
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = posts ?? [];
  const totals = rows.reduce(
    (acc, p) => {
      acc.likes += p.like_count ?? 0;
      acc.replies += p.reply_count ?? 0;
      acc.reposts += p.repost_count ?? 0;
      acc.views += p.view_count ?? 0;
      return acc;
    },
    { likes: 0, replies: 0, reposts: 0, views: 0 }
  );
  const best = [...rows].sort(
    (a, b) =>
      (b.like_count ?? 0) + (b.repost_count ?? 0) - ((a.like_count ?? 0) + (a.repost_count ?? 0))
  )[0];
  const cashtagCounts = new Map<string, number>();
  for (const p of rows)
    for (const c of (p.cashtags ?? []) as string[])
      cashtagCounts.set(c.toUpperCase(), (cashtagCounts.get(c.toUpperCase()) ?? 0) + 1);
  const topCashtags = [...cashtagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, n]) => `$${tag} (${n})`);

  // Follower / following counts (real).
  const [{ count: followers }, { count: following }] = await Promise.all([
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followed_id", profile.id),
    db.from("follows").select("followed_id", { count: "exact", head: true }).eq("follower_id", profile.id),
  ]);

  const wallet = profile.wallet_address
    ? await walletSnapshot(profile.wallet_address)
    : null;

  const facts: string[] = [
    `Handle: @${profile.handle ?? "unknown"}${profile.display_name ? ` (${profile.display_name})` : ""}.`,
    `Standing: ${profile.renown ?? 0} Renown, ${profile.glory ?? 0} Glory, ${profile.points ?? 0} Points, tier ${profile.tier ?? "unranked"}.`,
    `Social: ${followers ?? 0} followers, ${following ?? 0} following.`,
    `Posts on record: ${rows.length}. Totals across them: ${totals.likes} likes, ${totals.replies} replies, ${totals.reposts} reposts, ${totals.views} views.`,
    topCashtags.length ? `Coins they post about most: ${topCashtags.join(", ")}.` : "They rarely post cashtags.",
    best?.body ? `Their best-performing post: "${best.body.slice(0, 180)}".` : "",
    wallet
      ? `Linked wallet holdings (Ethereum, live): about $${Math.round(wallet.totalUsd ?? 0)} total; top: ${wallet.top.map((h) => `${h.symbol} $${Math.round(h.quoteUsd)}`).join(", ") || "none"}.`
      : profile.wallet_address
        ? "A wallet is linked but live holdings could not be read right now."
        : "No wallet is linked yet.",
  ].filter(Boolean);

  const prompt =
    "Scan MY account and give me a sharp, honest personal briefing as the Oracle. " +
    "Use only the figures provided. Cover, with short headers: my Standing, my Content (what is working and what is not), " +
    "my Wallet (only if holdings are provided), the Risks or gaps you see, and three concrete Next moves to grow my renown, engagement and earnings on this platform. " +
    "Be direct and specific to my real numbers. No financial advice or price predictions, no guarantees, no em-dashes.";

  const result = await askRaven(
    [{ role: "user", content: prompt }],
    facts.join("\n"),
    { length: "long" }
  );
  if (!result)
    return json({ error: "The Oracle is preoccupied. Try again shortly." }, 502);

  return json({
    briefing: result.text,
    stats: {
      renown: profile.renown ?? 0,
      glory: profile.glory ?? 0,
      points: profile.points ?? 0,
      followers: followers ?? 0,
      posts: rows.length,
      totalEngagement: totals.likes + totals.replies + totals.reposts,
      walletUsd: wallet?.totalUsd ?? null,
    },
    generatedAt: Date.now(),
  });
}
