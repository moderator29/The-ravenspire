/* Shared types for The Watch. Kept framework-free so both the API route and
   client components (score badge, results panel) can import them. */

export type CheckStatus = "pass" | "caution" | "risk" | "unknown";
export type CheckGroup = "contract" | "trading" | "holders";

export interface WatchCheck {
  label: string;
  status: CheckStatus;
  group: CheckGroup;
  detail?: string;
}

export type WatchVerdict = "safe" | "caution" | "danger" | "unknown";

export interface WatchReport {
  score: number;
  verdict: WatchVerdict;
  headline: string;
  checks: WatchCheck[];
  raw: {
    buyTax: number;
    sellTax: number;
    taxSource: "simulation" | "static";
    ownerPercent: number | null;
    creatorPercent: number | null;
    holderCount: number | null;
    lpLockedPercent: number | null;
  };
  address: string;
  chain: string;
  explorer: string | null;
}

/* Supported GoPlus / honeypot.is chains. The client only ever sends one of
   these; anything else is rejected server-side (path-injection guard). */
export const WATCH_CHAINS: Record<
  string,
  { label: string; explorer: string; honeypot: boolean }
> = {
  "1": { label: "Ethereum", explorer: "https://etherscan.io", honeypot: true },
  "8453": { label: "Base", explorer: "https://basescan.org", honeypot: true },
  "42161": {
    label: "Arbitrum",
    explorer: "https://arbiscan.io",
    honeypot: true,
  },
  "10": {
    label: "Optimism",
    explorer: "https://optimistic.etherscan.io",
    honeypot: false,
  },
  "56": {
    label: "BNB Chain",
    explorer: "https://bscscan.com",
    honeypot: true,
  },
};
