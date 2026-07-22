import { json } from "@/lib/auth/server";
import { SMART_WALLETS, walletSnapshot } from "@/lib/data/smartmoney";
import {
  MIN_LIQUIDITY_USD,
  MIN_MARKET_CAP_USD,
  isEvmGeckoNetwork,
  tradeChainByGecko,
} from "@/lib/trade/config";

/* Organic market intelligence. GeckoTerminal trending pools rank by real
   trading interest (volume / attention), not paid promotion, so we never
   relabel promoter-funded boosts as "what the realm is watching". Keyless.

   EVM ONLY. Solana and every non-EVM network are dropped before a coin ever
   reaches the glass, because the in-app trading surface is EVM-only (0x). The
   allowlist and quality floors live in lib/trade/config.ts. */

interface GeckoPool {
  id?: string;
  attributes?: {
    name?: string;
    base_token_price_usd?: string | null;
    reserve_in_usd?: string | null;
    market_cap_usd?: string | null;
    fdv_usd?: string | null;
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

    let droppedNonEvm = 0;
    let droppedThin = 0;

    const mapped = (body.data ?? [])
      .map((pool) => {
        const a = pool.attributes ?? {};
        const baseId = pool.relationships?.base_token?.data?.id ?? "";
        const base = tokens.get(baseId);
        const networkId = baseId.split("_")[0] ?? "";
        const chain = tradeChainByGecko(networkId);
        const address = base?.attributes?.address ?? "";
        const liquidity = Number(a.reserve_in_usd ?? 0);
        const marketCap = a.market_cap_usd ? Number(a.market_cap_usd) : null;
        const fdv = a.fdv_usd ? Number(a.fdv_usd) : null;
        // Prefer a real circulating market cap; fall back to FDV for the floor
        // check so a coin with only FDV reported is not unfairly dropped.
        const capForFloor = marketCap ?? fdv ?? 0;
        return {
          networkId,
          evm: isEvmGeckoNetwork(networkId),
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
          marketCap,
          fdv,
          capForFloor,
          chain: chain?.name ?? networkId,
          watchChain: chain ? String(chain.id) : null,
          network: networkId,
          logo: cleanLogo(base?.attributes?.image_url),
          address,
          url: address
            ? `https://www.geckoterminal.com/${networkId}/pools/${pool.id?.split("_").slice(1).join("_") ?? ""}`
            : "",
        };
      })
      .filter((t) => {
        if (!t.address) return false;
        // EVM only. Solana and every non-EVM chain are dropped here.
        if (!t.evm) {
          droppedNonEvm += 1;
          return false;
        }
        // Quality floors: thin liquidity and micro-cap launches skew to scams.
        if (
          t.liquidityUsd < MIN_LIQUIDITY_USD ||
          t.capForFloor < MIN_MARKET_CAP_USD
        ) {
          droppedThin += 1;
          return false;
        }
        return true;
      });

    // Top coins by big volume at the top of the glass.
    const trending = mapped
      .slice()
      .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
      // Strip the internal bookkeeping fields before serializing.
      .map(({ evm, networkId, capForFloor, ...rest }) => {
        void evm;
        void networkId;
        void capForFloor;
        return rest;
      })
      .slice(0, 14);

    if (droppedNonEvm > 0 || droppedThin > 0) {
      console.log(
        `[scrying] dropped ${droppedNonEvm} non-EVM and ${droppedThin} thin/micro-cap pools; ${trending.length} surfaced`
      );
    }

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
