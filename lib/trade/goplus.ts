import "server-only";

/* GoPlus token security: real, on-chain safety signals for a coin before a
   member trades it (honeypot, buy/sell tax, mint authority, blacklist, pausable
   transfers, unverified source, and so on). Keyless works with a public rate
   limit; when GOPLUS_APP_KEY / GOPLUS_APP_SECRET are set we fetch an access
   token for higher limits. Real data only: when the lens cannot read a token we
   return null and the UI says the safety read is unavailable rather than
   implying it is safe. */

import crypto from "node:crypto";

export type Severity = "danger" | "warn" | "info";

export interface SafetyFlag {
  severity: Severity;
  label: string;
}

export interface TokenSafety {
  address: string;
  chainId: number;
  flags: SafetyFlag[];
  buyTax: number | null;
  sellTax: number | null;
  isHoneypot: boolean;
  isOpenSource: boolean | null;
  holderCount: number | null;
  /* Worst severity across the flags, for a single headline read. */
  worst: Severity | null;
}

let cachedToken: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string | null> {
  const appKey = process.env.GOPLUS_APP_KEY;
  const appSecret = process.env.GOPLUS_APP_SECRET;
  if (!appKey || !appSecret) return null;
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
  try {
    const time = Math.floor(Date.now() / 1000);
    const sign = crypto
      .createHash("sha1")
      .update(`${appKey}${time}${appSecret}`)
      .digest("hex");
    const res = await fetch("https://api.gopluslabs.io/api/v1/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_key: appKey, time, sign }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: { access_token?: string; expires_in?: number };
    };
    const token = body.result?.access_token;
    if (!token) return null;
    cachedToken = {
      token,
      expires: Date.now() + (body.result?.expires_in ?? 3600) * 1000 - 60_000,
    };
    return token;
  } catch {
    return null;
  }
}

interface GoPlusToken {
  is_honeypot?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_open_source?: string;
  is_mintable?: string;
  owner_change_balance?: string;
  is_blacklisted?: string;
  cannot_sell_all?: string;
  transfer_pausable?: string;
  is_proxy?: string;
  is_anti_whale?: string;
  trading_cooldown?: string;
  hidden_owner?: string;
  can_take_back_ownership?: string;
  honeypot_with_same_creator?: string;
  holder_count?: string;
  cannot_buy?: string;
}

function pct(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n * 100 : null;
}

function truthy(v: string | undefined): boolean {
  return v === "1";
}

export async function tokenSafety(
  chainId: number,
  address: string
): Promise<TokenSafety | null> {
  const addr = address.toLowerCase();
  try {
    const token = await accessToken();
    const res = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addr}`,
      {
        headers: token ? { Authorization: token } : undefined,
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      code?: number;
      result?: Record<string, GoPlusToken>;
    };
    const t = body.result?.[addr];
    if (!t) return null;

    const buyTax = pct(t.buy_tax);
    const sellTax = pct(t.sell_tax);
    const flags: SafetyFlag[] = [];

    if (truthy(t.is_honeypot) || truthy(t.honeypot_with_same_creator))
      flags.push({ severity: "danger", label: "Honeypot risk: selling may be blocked" });
    if (truthy(t.cannot_sell_all))
      flags.push({ severity: "danger", label: "Holders cannot sell all of their balance" });
    if (truthy(t.cannot_buy))
      flags.push({ severity: "danger", label: "Buying is currently restricted" });
    if (truthy(t.is_blacklisted))
      flags.push({ severity: "danger", label: "Contract can blacklist wallets" });
    if (truthy(t.can_take_back_ownership))
      flags.push({ severity: "danger", label: "Ownership can be reclaimed" });
    if (truthy(t.hidden_owner))
      flags.push({ severity: "danger", label: "Hidden owner detected" });

    if (sellTax !== null && sellTax >= 10)
      flags.push({ severity: "warn", label: `High sell tax (${sellTax.toFixed(0)}%)` });
    if (buyTax !== null && buyTax >= 10)
      flags.push({ severity: "warn", label: `High buy tax (${buyTax.toFixed(0)}%)` });
    if (truthy(t.is_mintable))
      flags.push({ severity: "warn", label: "Supply is mintable" });
    if (truthy(t.owner_change_balance))
      flags.push({ severity: "warn", label: "Owner can change balances" });
    if (truthy(t.transfer_pausable))
      flags.push({ severity: "warn", label: "Transfers can be paused" });
    if (truthy(t.trading_cooldown))
      flags.push({ severity: "warn", label: "Trading cooldown enforced" });
    if (t.is_open_source !== undefined && !truthy(t.is_open_source))
      flags.push({ severity: "warn", label: "Contract source is not verified" });
    if (truthy(t.is_proxy))
      flags.push({ severity: "info", label: "Upgradeable proxy contract" });

    const holderCount =
      t.holder_count !== undefined && t.holder_count !== ""
        ? Number(t.holder_count)
        : null;

    const worst: Severity | null = flags.some((f) => f.severity === "danger")
      ? "danger"
      : flags.some((f) => f.severity === "warn")
        ? "warn"
        : flags.length > 0
          ? "info"
          : null;

    return {
      address: addr,
      chainId,
      flags,
      buyTax,
      sellTax,
      isHoneypot: truthy(t.is_honeypot) || truthy(t.honeypot_with_same_creator),
      isOpenSource: t.is_open_source !== undefined ? truthy(t.is_open_source) : null,
      holderCount: Number.isFinite(holderCount) ? holderCount : null,
      worst,
    };
  } catch {
    return null;
  }
}
