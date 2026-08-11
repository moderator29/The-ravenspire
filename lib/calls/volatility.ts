import "server-only";
import { COINGECKO_IDS } from "@/lib/data/tokens";
import type { PriceSubject } from "@/lib/calls/types";

/* Trailing realized volatility, annualized, from real price data only.

   sigma is the input that decides how hard a Call is, so it is also the input
   that decides how much Renown a Call can mint. There is no default and no
   fallback constant: if the realm cannot measure a token's volatility from real
   data, the Call is refused rather than sealed against an invented difficulty.
   That is the same line as "no price, no Call".

   Two sources, both keyless and both free, matching how lib/data/tokens.ts
   already resolves prices:

     majors      CoinGecko daily market chart, 30 closes, the textbook estimator
     DEX tokens  DexScreener's realized price changes over three horizons

   Both are annualized so that impliedBaseline can take sigma * sqrt(t) with t
   in years, whatever the Call's window. */

/* Trading days per year. Crypto never closes, so this is calendar days. */
const DAYS_PER_YEAR = 365;

/* Annualized volatility outside this band is measurement noise rather than
   signal: below it, a stale feed reporting no movement would make every Call
   look impossible, and above it the baseline saturates at 0.5 anyway. */
const SIGMA_MIN = 0.05;
const SIGMA_MAX = 20;

export interface VolatilityReading {
  /* Annualized trailing realized volatility. */
  sigma: number;
  /* Where it came from, stored on the Call so the number can be explained. */
  source: "coingecko-30d" | "dexscreener-realized";
  /* How many independent observations backed it. */
  samples: number;
}

/* Sample standard deviation of daily log returns, annualized. */
function annualizedFromCloses(closes: number[]): number | null {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const next = closes[i];
    if (!(prev > 0) || !(next > 0)) continue;
    returns.push(Math.log(next / prev));
  }
  if (returns.length < 10) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, r) => a + (r - mean) * (r - mean), 0) /
    (returns.length - 1);
  const daily = Math.sqrt(variance);
  if (!(daily > 0)) return null;
  return daily * Math.sqrt(DAYS_PER_YEAR);
}

async function coingeckoVolatility(id: string): Promise<VolatilityReading | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30&interval=daily`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { prices?: [number, number][] };
    const closes = (body.prices ?? [])
      .map((p) => p?.[1])
      .filter((p): p is number => typeof p === "number" && p > 0);
    const sigma = annualizedFromCloses(closes);
    if (sigma === null) return null;
    return {
      sigma: Math.min(Math.max(sigma, SIGMA_MIN), SIGMA_MAX),
      source: "coingecko-30d",
      samples: closes.length - 1,
    };
  } catch {
    return null;
  }
}

/* For a driftless Gaussian the expected absolute return over a window is
   sigma * sqrt(2 / pi), so a single realized move over that window is an
   unbiased, if noisy, estimator of sigma once scaled by sqrt(pi / 2).
   DexScreener publishes realized changes over 1h, 6h and 24h; averaging the
   three estimates across horizons is what makes a one-observation estimator
   usable, and it is the only trailing history available for a DEX token
   without a paid history API. */
const MAD_TO_SIGMA = Math.sqrt(Math.PI / 2);

interface DexPairChange {
  chainId?: string;
  baseToken?: { address?: string };
  liquidity?: { usd?: number };
  priceChange?: { h1?: number; h6?: number; h24?: number };
}

async function dexVolatility(
  address: string,
  chain: string
): Promise<VolatilityReading | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { pairs?: DexPairChange[] };
    const pairs = (body.pairs ?? [])
      .filter(
        (p) =>
          p.chainId === chain &&
          p.baseToken?.address?.toLowerCase() === address.toLowerCase()
      )
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const deepest = pairs[0];
    if (!deepest?.priceChange) return null;

    /* Each entry is [realized percent move, periods per year for that window]. */
    const windows: [number | undefined, number][] = [
      [deepest.priceChange.h1, 24 * DAYS_PER_YEAR],
      [deepest.priceChange.h6, 4 * DAYS_PER_YEAR],
      [deepest.priceChange.h24, DAYS_PER_YEAR],
    ];

    const estimates: number[] = [];
    for (const [pct, periodsPerYear] of windows) {
      if (typeof pct !== "number" || !Number.isFinite(pct)) continue;
      /* Log return, so a -50% and a +100% move read as the same magnitude. */
      const ratio = 1 + pct / 100;
      if (!(ratio > 0)) continue;
      const absReturn = Math.abs(Math.log(ratio));
      if (absReturn === 0) continue;
      estimates.push(absReturn * MAD_TO_SIGMA * Math.sqrt(periodsPerYear));
    }

    /* Every window reporting a flat zero means the pair is not trading, not
       that it is riskless. Refuse rather than call it certain. */
    if (estimates.length === 0) return null;

    const sigma = estimates.reduce((a, b) => a + b, 0) / estimates.length;
    return {
      sigma: Math.min(Math.max(sigma, SIGMA_MIN), SIGMA_MAX),
      source: "dexscreener-realized",
      samples: estimates.length,
    };
  } catch {
    return null;
  }
}

/* Resolve trailing volatility for a pinned Call subject. Returns null when the
   realm cannot measure it, which the caller must treat as "this Call cannot be
   sealed" rather than substituting a number. */
export async function realizedVolatility(
  subject: PriceSubject
): Promise<VolatilityReading | null> {
  if (subject.kind === "coingecko") return coingeckoVolatility(subject.id);
  if (subject.kind === "dex") return dexVolatility(subject.address, subject.chain);

  /* A legacy row pinned to nothing but a ticker. The curated majors map is a
     safe symbol lookup because no impostor can enter it; anything else has no
     trustworthy identity to measure and gets no reading. */
  const id = COINGECKO_IDS[subject.token.toLowerCase()];
  return id ? coingeckoVolatility(id) : null;
}
