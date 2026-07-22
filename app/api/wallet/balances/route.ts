import { json } from "@/lib/auth/server";
import { EVM_CHAINS, type EvmChain } from "@/components/wallet/chains";
import type { WalletToken } from "@/components/wallet/wallet-token-types";
import { formatUnits } from "viem";

/* Read-only multi-chain balances proxy for the Vault. Reuses the existing
   GOLDRUSH_API_KEY (Covalent) plumbing but spans the full set of seven EVM
   chains the wallet supports, and returns everything the client needs to send
   a token (raw balance + decimals + native flag) alongside the logo_url the
   provider gives us. Real data only: when the key is absent, or a chain is
   unreachable, that chain is simply omitted rather than invented. */

export const dynamic = "force-dynamic";

interface GoldRushItem {
  contract_ticker_symbol: string | null;
  contract_name: string | null;
  contract_decimals: number | null;
  contract_address: string | null;
  balance: string | null;
  quote: number | null;
  quote_rate: number | null;
  quote_rate_24h?: number | null;
  logo_url: string | null;
  is_spam?: boolean | null;
  type?: string | null;
  native_token?: boolean | null;
}

const NATIVE_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function authHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

/* Precise display amount, BigInt-safe so balances above 2^53 stay exact. */
function displayAmount(raw: string, decimals: number): string {
  let s: string;
  try {
    s = formatUnits(BigInt(raw), decimals);
  } catch {
    return "0";
  }
  const [intPart, fracPart = ""] = s.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const big = BigInt(intPart) >= 1000n;
  const frac = fracPart.slice(0, big ? 2 : 6).replace(/0+$/, "");
  return frac ? `${grouped}.${frac}` : grouped;
}

async function fetchChain(
  key: string,
  chain: EvmChain,
  address: string
): Promise<WalletToken[]> {
  try {
    const res = await fetch(
      `https://api.covalenthq.com/v1/${chain.covalent}/address/${address}/balances_v2/?quote-currency=USD&nft=false&no-spam=true`,
      {
        headers: { Authorization: authHeader(key) },
        next: { revalidate: 45 },
      }
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { items?: GoldRushItem[] } };

    return (body.data?.items ?? [])
      .filter((it) => !it.is_spam && it.type !== "dust")
      .map((it): WalletToken | null => {
        const contract = it.contract_address ?? null;
        const isNative =
          it.native_token === true ||
          (contract?.toLowerCase() === NATIVE_SENTINEL);
        const decimals = it.contract_decimals ?? 18;
        const raw = it.balance ?? "0";
        let amount = 0;
        try {
          amount = Number(formatUnits(BigInt(raw), decimals));
        } catch {
          amount = 0;
        }

        // Native coins are always shown (they are the gas coin for the chain).
        // Other tokens are kept only when the wallet actually holds some.
        if (!isNative) {
          try {
            if (BigInt(raw) <= 0n) return null;
          } catch {
            return null;
          }
        }

        const rate = it.quote_rate ?? 0;
        const rate24 = it.quote_rate_24h ?? 0;
        const change24h =
          rate24 > 0 ? ((rate - rate24) / rate24) * 100 : 0;

        return {
          key: `${chain.id}:${isNative ? "native" : (contract ?? "").toLowerCase()}`,
          chainId: chain.id,
          chainName: chain.name,
          chainShort: chain.short,
          symbol: it.contract_ticker_symbol ?? chain.native,
          name: it.contract_name ?? "Unknown token",
          contract: isNative ? null : contract,
          isNative,
          decimals,
          balanceRaw: raw,
          balanceDisplay: displayAmount(raw, decimals),
          quoteUsd: it.quote ?? 0,
          priceUsd: rate,
          change24h: Number.isFinite(change24h) ? change24h : 0,
          logo: it.logo_url ?? null,
        };
      })
      .filter((t): t is WalletToken => t !== null);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const key = process.env.GOLDRUSH_API_KEY;
  if (!key) return json({ configured: false, tokens: [], totalUsd: 0 });

  const address = new URL(req.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json({ configured: true, error: "invalid address" }, 400);
  }

  try {
    const perChain = await Promise.all(
      EVM_CHAINS.map((c) => fetchChain(key, c, address))
    );
    const tokens = perChain.flat().sort((a, b) => {
      if (b.quoteUsd !== a.quoteUsd) return b.quoteUsd - a.quoteUsd;
      // Tie-break so native coins with no price still lead their chain group.
      return Number(b.isNative) - Number(a.isNative);
    });
    const totalUsd = tokens.reduce((s, t) => s + t.quoteUsd, 0);
    return json({ configured: true, tokens, totalUsd });
  } catch {
    return json({ configured: true, error: "unreachable", tokens: [] }, 502);
  }
}
