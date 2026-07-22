import { json } from "@/lib/auth/server";

/* The Watch reads a wallet's open ERC-20 approvals so a member can see exactly
   who can still move their tokens, and revoke with one tap. Real data via
   GoldRush/Covalent's approvals endpoint (value at risk, spender labels, a risk
   verdict). Non-custodial: this route only reads the public ledger; revoking is
   a separate wallet-signed action. Multi-chain. Degrades honestly without a
   GoldRush key. */

const COVALENT_CHAIN: Record<string, string> = {
  "1": "eth-mainnet",
  "8453": "base-mainnet",
  "42161": "arbitrum-mainnet",
  "10": "optimism-mainnet",
  "56": "bsc-mainnet",
  "137": "matic-mainnet",
  "43114": "avalanche-mainnet",
};

interface CovalentSpender {
  spender_address?: string;
  spender_address_label?: string | null;
  allowance?: string | null;
  value_at_risk_quote?: number | null;
  risk_factor?: string | null;
}
interface CovalentApproval {
  token_address?: string;
  ticker_symbol?: string | null;
  logo_url?: string | null;
  value_at_risk_quote?: number | null;
  spenders?: CovalentSpender[];
}

export interface ApprovalRow {
  token: string;
  tokenSymbol: string | null;
  tokenLogo: string | null;
  spender: string;
  spenderLabel: string | null;
  allowance: string | null;
  valueAtRiskUsd: number | null;
  risky: boolean;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").toLowerCase();
  const chain = url.searchParams.get("chain") ?? "1";

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return json({ configured: false, approvals: [], error: "invalid address" }, 400);
  }
  const slug = COVALENT_CHAIN[chain];
  if (!slug) {
    return json({ configured: true, approvals: [], error: "unsupported chain" }, 400);
  }

  const key = process.env.GOLDRUSH_API_KEY;
  if (!key) return json({ configured: false, approvals: [] });

  try {
    const res = await fetch(
      `https://api.covalenthq.com/v1/${slug}/approvals/${address}/?key=${key}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      return json({
        configured: true,
        approvals: [],
        error: "The Watch could not reach the ledger.",
      });
    }
    const body = (await res.json()) as {
      data?: { items?: CovalentApproval[] };
    };
    const items = body.data?.items ?? [];
    const approvals: ApprovalRow[] = [];
    for (const it of items) {
      const token = (it.token_address ?? "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(token)) continue;
      for (const s of it.spenders ?? []) {
        const spender = (s.spender_address ?? "").toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(spender)) continue;
        const risk = (s.risk_factor ?? "").toUpperCase();
        approvals.push({
          token,
          tokenSymbol: it.ticker_symbol ?? null,
          tokenLogo: it.logo_url ?? null,
          spender,
          spenderLabel: s.spender_address_label ?? null,
          allowance: s.allowance ?? null,
          valueAtRiskUsd:
            typeof s.value_at_risk_quote === "number"
              ? s.value_at_risk_quote
              : typeof it.value_at_risk_quote === "number"
                ? it.value_at_risk_quote
                : null,
          risky: risk.includes("REVOK") || risk.includes("RISK"),
        });
      }
    }
    // Highest value at risk first.
    approvals.sort((a, b) => (b.valueAtRiskUsd ?? 0) - (a.valueAtRiskUsd ?? 0));
    return json({ configured: true, approvals });
  } catch {
    return json({
      configured: true,
      approvals: [],
      error: "The Watch could not reach the ledger.",
    });
  }
}
