import { json } from "@/lib/auth/server";
import { SMART_WALLETS, walletSnapshot } from "@/lib/data/smartmoney";

/* Organic market intelligence. GeckoTerminal trending pools rank by real
   trading interest (volume / attention), not paid promotion, so we never
   relabel promoter-funded boosts as "what the realm is watching". Keyless. */
const GECKO_NETWORKS: Record<
  string,
  { label: string; watch: string | null }
> = {
  eth: { label: "Ethereum", watch: "1" },
  base: { label: "Base", watch: "8453" },
  arbitrum: { label: "Arbitrum", watch: "42161" },
  optimism: { label: "Optimism", watch: "10" },
  bsc: { label: "BNB Chain", watch: "56" },
  polygon_pos: { label: "Polygon", watch: null },
  solana: { label: "Solana", watch: null },
  avax: { label: "Avalanche", watch: null },
};

interface GeckoPool {
  id?: string;
  attributes?: {
    name?: string;
    base_token_price_usd?: string | null;
    reserve_in_usd?: string | null;
    volume_usd?: { h24?: string | null };
    price_change_percentage?: { h24?: string | null };
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
  };
}

interface GeckoIncluded {
  id?: string;
  type?: string;
  attributes?: {
    symbol?: string;
    name?: string;
    address?: string;
    image_url?: string | null;
  };
}

/* GeckoTerminal serves a placeholder "missing.png" for tokens without art;
   treat that (and blanks) as no logo so the UI draws its own glyph instead. */
function cleanLogo(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.toLowerCase().includes("missing")) return null;
  return src;
}

async function readTrending() {
  try {
    const res = await fetch(
      "https://api.geckoterminal.com/api/v2/networks/trending_pools?include=base_token&page=1",
      {
        headers: { accept: "application/json" },
        next: { revalidate: 120 },
      }
    );
    if (!res.ok) return { trending: [], error: "unreachable" as const };

    const body = (await res.json()) as {
      data?: GeckoPool[];
      included?: GeckoIncluded[];
    };
    const tokens = new Map<string, GeckoIncluded>();
    for (const inc of body.included ?? []) {
      if (inc.type === "token" && inc.id) tokens.set(inc.id, inc);
    }

    const trending = (body.data ?? [])
      .map((pool) => {
        const a = pool.attributes ?? {};
        const baseId = pool.relationships?.base_token?.data?.id ?? "";
        const base = tokens.get(baseId);
        const networkId = baseId.split("_")[0] ?? "";
        const net = GECKO_NETWORKS[networkId];
        const address = base?.attributes?.address ?? "";
        const liquidity = Number(a.reserve_in_usd ?? 0);
        return {
          symbol: base?.attributes?.symbol?.toUpperCase() ?? "?",
          name: a.name ?? base?.attributes?.name ?? "Unknown pair",
          priceUsd: a.base_token_price_usd
            ? Number(a.base_token_price_usd)
            : null,
          change24h: a.price_change_percentage?.h24
            ? Number(a.price_change_percentage.h24)
            : null,
          volume24h: a.volume_usd?.h24 ? Number(a.volume_usd.h24) : null,
          liquidityUsd: liquidity,
          chain: net?.label ?? networkId,
          watchChain: net?.watch ?? null,
          network: networkId,
          logo: cleanLogo(base?.attributes?.image_url),
          address,
          url: address
            ? `https://www.geckoterminal.com/${networkId}/pools/${pool.id?.split("_").slice(1).join("_") ?? ""}`
            : "",
        };
      })
      // Safety floor: skip vanishingly thin pools that skew to scam launches.
      .filter((t) => t.address && t.liquidityUsd >= 20_000)
      .slice(0, 12);

    return { trending };
  } catch {
    return { trending: [], error: "unreachable" as const };
  }
}

async function readWallets() {
  const configured = Boolean(process.env.GOLDRUSH_API_KEY);
  const wallets = await Promise.all(
    SMART_WALLETS.map(async (w) => {
      const snap = configured ? await walletSnapshot(w.address) : null;
      return {
        name: w.name,
        house: w.house,
        address: w.address,
        note: w.note ?? null,
        totalUsd: snap?.totalUsd ?? null,
        top: snap?.top ?? [],
      };
    })
  );
  return { configured, wallets };
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  if (url.searchParams.get("wallets") === "1") {
    try {
      return json(await readWallets());
    } catch {
      return json({
        configured: Boolean(process.env.GOLDRUSH_API_KEY),
        wallets: [],
      });
    }
  }

  return json(await readTrending());
}
