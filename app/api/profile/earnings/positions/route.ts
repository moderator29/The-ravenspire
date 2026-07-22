import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { EVM_CHAINS, type EvmChain } from "@/components/wallet/chains";
import type { PositionToken } from "@/app/api/profile/earnings/types";
import { formatUnits } from "viem";

/* Public positions for The Coffers, privacy-gated.

   Who sees what:
     - The owner sees their live holdings AND their wallet balance total.
     - Another member sees the target's holdings ONLY when the target has both
       PnL visibility AND public positions turned on, and never the balance
       total (the aggregate figure stays owner-only).

   The member's raw wallet address is never returned to other viewers: the
   server resolves it, reads the chain balances, and hands back only the
   sanitized token rows the member opted to make public. Real data only, drawn
   from the same GoldRush/Covalent plumbing the Vault uses; when the key is
   absent or a chain is unreachable it is omitted, not invented. */

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

/* BigInt-safe display amount so balances above 2^53 stay exact. */
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
): Promise<PositionToken[]> {
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
      .map((it): PositionToken | null => {
        const contract = it.contract_address ?? null;
        const isNative =
          it.native_token === true ||
          contract?.toLowerCase() === NATIVE_SENTINEL;
        const decimals = it.contract_decimals ?? 18;
        const raw = it.balance ?? "0";

        // Non-native tokens are kept only when a positive balance is held.
        if (!isNative) {
          try {
            if (BigInt(raw) <= 0n) return null;
          } catch {
            return null;
          }
        }

        const rate = it.quote_rate ?? 0;
        const rate24 = it.quote_rate_24h ?? 0;
        const change24h = rate24 > 0 ? ((rate - rate24) / rate24) * 100 : 0;

        return {
          key: `${chain.id}:${isNative ? "native" : (contract ?? "").toLowerCase()}`,
          symbol: it.contract_ticker_symbol ?? chain.native,
          name: it.contract_name ?? "Unknown token",
          logo: it.logo_url ?? null,
          chainShort: chain.short,
          amount: displayAmount(raw, decimals),
          valueUsd: it.quote ?? 0,
          change24h: Number.isFinite(change24h) ? change24h : 0,
          native: isNative,
        };
      })
      .filter((t): t is PositionToken => t !== null);
  } catch {
    return [];
  }
}

async function fetchPositions(
  key: string,
  address: string
): Promise<{ tokens: PositionToken[]; totalUsd: number }> {
  const perChain = await Promise.all(
    EVM_CHAINS.map((c) => fetchChain(key, c, address))
  );
  const tokens = perChain.flat().sort((a, b) => {
    if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;
    return Number(b.native) - Number(a.native);
  });
  const totalUsd = tokens.reduce((s, t) => s + t.valueUsd, 0);
  return { tokens, totalUsd };
}

function privacyFlag(settings: unknown, flag: string): boolean {
  /* Default ON: a member is only hidden when they explicitly set it false. */
  if (settings && typeof settings === "object") {
    const privacy = (settings as Record<string, unknown>).privacy;
    if (privacy && typeof privacy === "object") {
      const val = (privacy as Record<string, unknown>)[flag];
      if (typeof val === "boolean") return val;
    }
  }
  return true;
}

export async function GET(req: Request) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "missing id" }, 400);

  const viewer = await getProfile(req);

  const { data: target, error: targetErr } = await db
    .from("profiles")
    .select("id, wallet_address, settings")
    .eq("id", id)
    .maybeSingle();
  if (targetErr || !target) return json({ error: "not found" }, 404);

  const isOwner = viewer?.id === target.id;
  const pnlVisible = privacyFlag(target.settings, "pnlVisible");
  const publicPositions = privacyFlag(target.settings, "publicPositions");

  const canViewPositions = isOwner || (pnlVisible && publicPositions);
  if (!canViewPositions) {
    return json({ canView: false, isOwner, tokens: [] });
  }

  const address = (target.wallet_address as string | null) ?? null;
  const key = process.env.GOLDRUSH_API_KEY;
  if (!key || !address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return json({ canView: true, isOwner, configured: false, tokens: [] });
  }

  try {
    const { tokens, totalUsd } = await fetchPositions(key, address);
    return json({
      canView: true,
      isOwner,
      configured: true,
      tokens,
      /* The aggregate balance total is owner-only, even when positions are
         public: a public holdings list should not double as a net-worth ping. */
      totalUsd: isOwner ? totalUsd : undefined,
    });
  } catch {
    return json({ canView: true, isOwner, configured: true, tokens: [] }, 502);
  }
}
