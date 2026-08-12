import "server-only";
import {
  type WatchCheck,
  type WatchReport,
  type WatchVerdict,
  WATCH_CHAINS,
} from "./watch-types";

/* GoPlus token_security fields we score. Every field is optional because
   GoPlus omits data for new / unindexed / not-yet-simulated tokens, and a
   missing field must never read as a pass. */
export interface GoPlusToken {
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  is_honeypot?: string;
  transfer_pausable?: string;
  cannot_sell_all?: string;
  trading_cooldown?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
  buy_tax?: string;
  sell_tax?: string;
  owner_percent?: string;
  creator_percent?: string;
  holder_count?: string;
  lp_holders?: Array<{
    is_locked?: number;
    percent?: string;
    tag?: string;
    address?: string;
  }>;
}

/* --- GoPlus access token (findings: GoPlus called unauthenticated) ---
   Signature is sha1(app_key + time + app_secret). We cache the bearer in
   module memory until shortly before it expires. Without keys we fall back
   to unauthenticated reads (lower per-IP quota) rather than failing. */
let tokenCache: { token: string; expiresAt: number } | null = null;

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getGoPlusToken(): Promise<string | null> {
  const appKey = process.env.GOPLUS_APP_KEY;
  const appSecret = process.env.GOPLUS_APP_SECRET;
  if (!appKey || !appSecret) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  try {
    const time = Math.floor(Date.now() / 1000);
    const sign = await sha1Hex(`${appKey}${time}${appSecret}`);
    const res = await fetch("https://api.gopluslabs.io/api/v1/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_key: appKey, time, sign }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      code?: number;
      result?: { access_token?: string; expires_in?: number };
    };
    const token = body.result?.access_token;
    if (!token) return null;
    const ttl = (body.result?.expires_in ?? 3600) * 1000;
    tokenCache = { token, expiresAt: Date.now() + ttl - 60_000 };
    return token;
  } catch {
    return null;
  }
}

export type GoPlusStatus =
  | "ok"
  | "pending"
  | "rate_limited"
  | "not_found"
  | "unreachable";

export interface GoPlusResult {
  status: GoPlusStatus;
  token?: GoPlusToken;
}

export async function fetchGoPlus(
  chain: string,
  address: string
): Promise<GoPlusResult> {
  const token = await getGoPlusToken();
  try {
    const res = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${encodeURIComponent(
        chain
      )}?contract_addresses=${address}`,
      {
        headers: token ? { Authorization: token } : undefined,
        next: { revalidate: 120 },
      }
    );
    if (res.status === 429) return { status: "rate_limited" };
    if (!res.ok) return { status: "unreachable" };

    const body = (await res.json()) as {
      code?: number;
      message?: string;
      result?: Record<string, GoPlusToken>;
    };
    // GoPlus code 4029 = per-IP rate limit; 2020/2018 = data still preparing.
    if (body.code === 4029) return { status: "rate_limited" };
    const result = body.result ?? {};
    const found = result[address] ?? Object.values(result)[0];
    if (!found || Object.keys(found).length === 0) {
      // Empty result on a valid request usually means the token has not been
      // indexed / simulated yet (freshest, highest-risk moment).
      return { status: body.code === 1 ? "pending" : "not_found" };
    }
    return { status: "ok", token: found };
  } catch {
    return { status: "unreachable" };
  }
}

/* --- honeypot.is cross-check --- keyless simulated buy/sell. */
export interface HoneypotResult {
  reached: boolean;
  isHoneypot: boolean;
  simulated: boolean;
  buyTax: number | null;
  sellTax: number | null;
  reason: string | null;
}

export async function fetchHoneypot(
  chain: string,
  address: string
): Promise<HoneypotResult> {
  const empty: HoneypotResult = {
    reached: false,
    isHoneypot: false,
    simulated: false,
    buyTax: null,
    sellTax: null,
    reason: null,
  };
  if (!WATCH_CHAINS[chain]?.honeypot) return empty;
  try {
    const res = await fetch(
      `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chain}`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) return empty;
    const body = (await res.json()) as {
      honeypotResult?: { isHoneypot?: boolean };
      simulationSuccess?: boolean;
      simulationResult?: { buyTax?: number; sellTax?: number };
      flags?: Array<{ description?: string; severity?: string }>;
    };
    const isHoneypot = Boolean(body.honeypotResult?.isHoneypot);
    return {
      reached: true,
      isHoneypot,
      simulated: Boolean(body.simulationSuccess),
      buyTax: body.simulationResult?.buyTax ?? null,
      sellTax: body.simulationResult?.sellTax ?? null,
      reason: isHoneypot
        ? (body.flags?.find((f) => f.description)?.description ??
          "Simulated sell was blocked")
        : null,
    };
  } catch {
    return empty;
  }
}

/* Tri-state read of a GoPlus boolean flag: "1" = yes, "0" = no, else unknown. */
function flag(v: string | undefined): "yes" | "no" | "unknown" {
  if (v === "1") return "yes";
  if (v === "0") return "no";
  return "unknown";
}

function pct(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? n * 100 : n;
}

/* Build the full report from GoPlus + honeypot.is. Scoring rules:
   - Fatal findings (honeypot, cannot_sell_all, owner can change balances,
     selfdestruct) floor the score at <= 5 and force a DO NOT BUY verdict.
   - Unknown critical fields cap the top score so an unanalysed token can
     never read as a clean 100.
   - Additive penalties for lesser risks. */
export function buildReport(
  address: string,
  chain: string,
  token: GoPlusToken,
  honeypot: HoneypotResult
): WatchReport {
  const checks: WatchCheck[] = [];
  let score = 100;
  let scoreCap = 100;
  let fatal = false;

  const add = (c: WatchCheck) => checks.push(c);

  // Contract source. GoPlus is_open_source: "1" = verified/open, "0" = closed.
  const openSource = flag(token.is_open_source);
  if (openSource === "yes") {
    add({
      group: "contract",
      label: "Contract verified",
      status: "pass",
      detail: "Source code is published",
    });
  } else if (openSource === "no") {
    score -= 20;
    add({
      group: "contract",
      label: "Contract unverified",
      status: "caution",
      detail: "Source code is not published",
    });
  } else {
    scoreCap = Math.min(scoreCap, 85);
    add({
      group: "contract",
      label: "Verification unknown",
      status: "unknown",
      detail: "Could not confirm whether source is published",
    });
  }

  // --- Fatal / high-severity contract flags ---
  const honeypotFlag = flag(token.is_honeypot);
  const honeypotHit = honeypotFlag === "yes" || honeypot.isHoneypot;
  if (honeypotHit) {
    fatal = true;
    add({
      group: "trading",
      label: "Honeypot detected",
      status: "risk",
      detail:
        honeypot.reason ??
        "Buys succeed but sells are blocked. Do not buy.",
    });
  } else if (honeypotFlag === "no" || honeypot.simulated) {
    add({
      group: "trading",
      label: "No honeypot detected",
      status: "pass",
      detail: honeypot.simulated ? "Confirmed by live buy/sell simulation" : undefined,
    });
  } else {
    scoreCap = Math.min(scoreCap, 70);
    add({
      group: "trading",
      label: "Honeypot status unknown",
      status: "unknown",
      detail: "Not yet simulated. Treat as unverified.",
    });
  }

  const cannotSell = flag(token.cannot_sell_all);
  if (cannotSell === "yes") {
    fatal = true;
    add({
      group: "trading",
      label: "Cannot sell entire balance",
      status: "risk",
      detail: "Holders are blocked from selling their full position",
    });
  } else if (cannotSell === "unknown") {
    scoreCap = Math.min(scoreCap, 80);
  }

  const ownerChange = flag(token.owner_change_balance);
  if (ownerChange === "yes") {
    fatal = true;
    add({
      group: "contract",
      label: "Owner can alter balances",
      status: "risk",
      detail: "The owner can rewrite holder balances at will",
    });
  } else if (ownerChange === "no") {
    add({
      group: "contract",
      label: "Balances beyond owner reach",
      status: "pass",
    });
  } else {
    scoreCap = Math.min(scoreCap, 85);
  }

  const selfdestruct = flag(token.selfdestruct);
  if (selfdestruct === "yes") {
    fatal = true;
    add({
      group: "contract",
      label: "Self-destruct present",
      status: "risk",
      detail: "The contract can be destroyed, stranding holders",
    });
  }

  // --- Owner power (caution) ---
  const takeBack = flag(token.can_take_back_ownership);
  if (takeBack === "yes") {
    score -= 25;
    add({
      group: "contract",
      label: "Ownership can be reclaimed",
      status: "risk",
      detail: "A renounced owner can take control back",
    });
  }

  const hiddenOwner = flag(token.hidden_owner);
  if (hiddenOwner === "yes") {
    score -= 20;
    add({
      group: "contract",
      label: "Hidden owner",
      status: "risk",
      detail: "Control is masked behind a hidden address",
    });
  }

  const proxy = flag(token.is_proxy);
  if (proxy === "yes") {
    score -= 12;
    add({
      group: "contract",
      label: "Upgradeable proxy",
      status: "caution",
      detail: "Contract logic can be swapped after launch",
    });
  } else if (proxy === "no") {
    add({ group: "contract", label: "Not a proxy", status: "pass" });
  }

  const mintable = flag(token.is_mintable);
  if (mintable === "yes") {
    score -= 15;
    add({
      group: "contract",
      label: "Owner can mint",
      status: "caution",
      detail: "Supply can be inflated at will",
    });
  } else if (mintable === "no") {
    add({ group: "contract", label: "No open mint", status: "pass" });
  }

  // --- Trading controls ---
  const pausable = flag(token.transfer_pausable);
  if (pausable === "yes") {
    score -= 18;
    add({
      group: "trading",
      label: "Transfers can be paused",
      status: "risk",
      detail: "The owner can freeze all trading",
    });
  }

  const blacklist = flag(token.is_blacklisted);
  if (blacklist === "yes") {
    score -= 15;
    add({
      group: "trading",
      label: "Blacklist mechanism",
      status: "caution",
      detail: "Specific wallets can be blocked from selling",
    });
  }

  const cooldown = flag(token.trading_cooldown);
  if (cooldown === "yes") {
    score -= 8;
    add({
      group: "trading",
      label: "Trading cooldown",
      status: "caution",
      detail: "A delay is enforced between trades",
    });
  }

  const slippageMod =
    flag(token.slippage_modifiable) === "yes" ||
    flag(token.personal_slippage_modifiable) === "yes";
  if (slippageMod) {
    score -= 10;
    add({
      group: "trading",
      label: "Tax can be changed",
      status: "caution",
      detail: "Buy/sell tax is modifiable after launch",
    });
  }

  // --- Taxes (prefer live simulation over static GoPlus values) ---
  const simTaxAvailable =
    honeypot.simulated &&
    honeypot.buyTax !== null &&
    honeypot.sellTax !== null;
  const buyTax = simTaxAvailable
    ? (honeypot.buyTax as number)
    : Number(token.buy_tax ?? 0) * 100 || 0;
  const sellTax = simTaxAvailable
    ? (honeypot.sellTax as number)
    : Number(token.sell_tax ?? 0) * 100 || 0;
  const taxSource: "simulation" | "static" = simTaxAvailable
    ? "simulation"
    : "static";
  const taxUnknown =
    !simTaxAvailable &&
    token.buy_tax === undefined &&
    token.sell_tax === undefined;

  if (taxUnknown) {
    scoreCap = Math.min(scoreCap, 80);
    add({
      group: "trading",
      label: "Trade taxes unknown",
      status: "unknown",
      detail: "No tax data available yet",
    });
  } else if (buyTax > 50 || sellTax > 50) {
    fatal = true;
    add({
      group: "trading",
      label: "Extreme trade tax",
      status: "risk",
      detail: `Buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%`,
    });
  } else if (buyTax > 10 || sellTax > 10) {
    score -= 12;
    add({
      group: "trading",
      label: "Heavy trade tax",
      status: "caution",
      detail: `Buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%`,
    });
  } else {
    add({
      group: "trading",
      label: "Trade taxes within reason",
      status: "pass",
      detail: `Buy ${buyTax.toFixed(1)}%, sell ${sellTax.toFixed(1)}%`,
    });
  }

  // --- Holders / concentration ---
  const ownerPercent = pct(token.owner_percent);
  const creatorPercent = pct(token.creator_percent);
  const topHeld = Math.max(ownerPercent ?? 0, creatorPercent ?? 0);
  if (ownerPercent === null && creatorPercent === null) {
    scoreCap = Math.min(scoreCap, 90);
  } else if (topHeld >= 50) {
    score -= 25;
    add({
      group: "holders",
      label: "Extreme supply concentration",
      status: "risk",
      detail: `Owner/creator holds ${topHeld.toFixed(1)}% of supply`,
    });
  } else if (topHeld >= 20) {
    score -= 12;
    add({
      group: "holders",
      label: "Concentrated supply",
      status: "caution",
      detail: `Owner/creator holds ${topHeld.toFixed(1)}% of supply`,
    });
  } else {
    add({
      group: "holders",
      label: "Supply reasonably distributed",
      status: "pass",
      detail: `Owner/creator holds ${topHeld.toFixed(1)}%`,
    });
  }

  const holderCount =
    token.holder_count !== undefined ? Number(token.holder_count) : null;

  // --- LP lock ---
  const lpHolders = token.lp_holders ?? [];
  let lpLockedPercent: number | null = null;
  if (lpHolders.length > 0) {
    lpLockedPercent = lpHolders.reduce((sum, h) => {
      const p = Number(h.percent ?? 0);
      const burned = (h.tag ?? "").toLowerCase().includes("burn");
      return sum + (h.is_locked === 1 || burned ? p : 0);
    }, 0);
    lpLockedPercent = Math.min(100, lpLockedPercent * 100);
    if (lpLockedPercent >= 90) {
      add({
        group: "holders",
        label: "Liquidity locked",
        status: "pass",
        detail: `${lpLockedPercent.toFixed(0)}% of LP locked or burned`,
      });
    } else if (lpLockedPercent >= 20) {
      score -= 12;
      add({
        group: "holders",
        label: "Liquidity partly locked",
        status: "caution",
        detail: `${lpLockedPercent.toFixed(0)}% of LP locked or burned`,
      });
    } else {
      score -= 22;
      add({
        group: "holders",
        label: "Liquidity unlocked",
        status: "risk",
        detail: `Only ${lpLockedPercent.toFixed(0)}% of LP locked; rug risk`,
      });
    }
  }

  // --- Finalize ---
  score = Math.min(score, scoreCap);
  if (fatal) score = Math.min(score, 5);
  score = Math.max(0, Math.min(100, Math.round(score)));

  let verdict: WatchVerdict;
  let headline: string;
  if (fatal) {
    verdict = "danger";
    headline = "DO NOT BUY";
  } else if (score < 40) {
    verdict = "danger";
    headline = "High risk";
  } else if (score < 70) {
    verdict = "caution";
    headline = "Proceed with caution";
  } else if (scoreCap < 100 && checks.some((c) => c.status === "unknown")) {
    verdict = "caution";
    headline = "Limited data, unverified";
  } else {
    verdict = "safe";
    headline = "No major flags found";
  }

  const chainInfo = WATCH_CHAINS[chain];
  return {
    score,
    verdict,
    headline,
    checks,
    raw: {
      buyTax,
      sellTax,
      taxSource,
      ownerPercent,
      creatorPercent,
      holderCount,
      lpLockedPercent,
    },
    address,
    chain,
    explorer: chainInfo ? `${chainInfo.explorer}/token/${address}` : null,
  };
}
