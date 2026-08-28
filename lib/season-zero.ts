/* Season Zero: the founding round.
 *
 * The single source of truth for every Season Zero surface: the landing
 * section, the in-realm page, the dashboard banner, the API and the docs all
 * read these constants. Change a number here and every surface agrees.
 *
 * The round is a direct, non-custodial contribution: a backer sends ETH from
 * their own wallet straight to the realm treasury address below, on Base or
 * on Ethereum mainnet. The platform never holds the funds at any point. The
 * server verifies each transaction on chain before recording it, so the
 * raised total is always real, verified data and never a hand-typed number.
 */

export const SEASON_ZERO = {
  /* The window. Contributions are accepted only inside it; the page itself
     is visible before and after, as a countdown and then as a record. */
  startsAt: "2026-09-01T00:00:00Z",
  endsAt: "2026-09-20T23:59:59Z",

  /* The caps, in whole ETH. Softcap is the minimum for the round to stand:
     below it, every contribution is returned to its sending wallet. Hardcap
     closes the round early if reached. */
  softcapEth: 6,
  hardcapEth: 15,

  /* The allocation. Seven percent of total supply, drawn from within the
     twenty percent Presale allocation in the published tokenomics. */
  supplyPct: 7,
  totalSupply: 10_000_000_000,
  rspAllocation: 700_000_000,

  /* Fixed rate, derived from the hardcap: 700,000,000 / 15. A backer knows
     their exact allocation the moment they contribute, whatever the round
     finally raises. */
  rspPerEth: 46_666_666,

  /* The realm treasury. Funds go wallet to wallet, never through us. */
  treasury: "0x7AA5055346b4C9dbcf1728BceA7Dc5B01ed5918d" as const,

  /* Where contributions are accepted. Base is primary (cheap, fast); the
     same address holds on Ethereum mainnet for backers who prefer it. */
  chains: [
    { id: 8453, name: "Base", primary: true },
    { id: 1, name: "Ethereum", primary: false },
  ],

  /* Dust guard. Below this a contribution costs more to verify and refund
     than it is worth. */
  minContributionEth: 0.01,
} as const;

export type SeasonZeroPhase = "upcoming" | "live" | "ended";

export function seasonZeroPhase(now: Date = new Date()): SeasonZeroPhase {
  const t = now.getTime();
  if (t < Date.parse(SEASON_ZERO.startsAt)) return "upcoming";
  if (t > Date.parse(SEASON_ZERO.endsAt)) return "ended";
  return "live";
}

/* Allocation for a contribution, in whole $RSP. Wei in, $RSP out, integer
   math against the fixed rate so two surfaces can never disagree by a
   rounding mode. */
export function rspForWei(wei: bigint): bigint {
  return (wei * BigInt(SEASON_ZERO.rspPerEth)) / 10n ** 18n;
}

export function formatEth(wei: bigint, maxDecimals = 4): string {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
