import { Card } from "@/components/ui/card";
import { CONSOLE_PAD } from "@/components/console/console-shell";
import { usdWhole, usd, pct, type Portfolio } from "@/components/ledger/portfolio-data";

/* A two-point trend from the value 24h ago to the value now. Both endpoints
   are real: "now" is the summed balances, "24h ago" is now minus the summed
   24h move. We do not draw a curve between them we cannot substantiate, only
   the honest line connecting two measured points. */
function TrendLine({ prev, now, up }: { prev: number; now: number; up: boolean }) {
  const w = 96;
  const h = 34;
  const pad = 5;
  const min = Math.min(prev, now);
  const max = Math.max(prev, now);
  const span = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const x0 = pad;
  const x1 = w - pad;
  const stroke = up ? "var(--chart-up)" : "var(--chart-down)";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="24 hour value trend"
    >
      <line
        x1={x0}
        y1={y(prev)}
        x2={x1}
        y2={y(now)}
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <circle cx={x0} cy={y(prev)} r={2.5} fill="var(--bone-faint)" />
      <circle cx={x1} cy={y(now)} r={3} fill={stroke} />
    </svg>
  );
}

export function ValueHeader({ portfolio }: { portfolio: Portfolio }) {
  const { totalUsd, change24hUsd, changePct, prevTotalUsd } = portfolio;
  const up = change24hUsd >= 0;

  return (
    <Card
      variant="warm"
      pad="none"
      render={<section />}
      className={CONSOLE_PAD}
    >
      <p className="text-[11px] uppercase tracking-[0.26em] text-bone-faint">
        Net worth
      </p>
      <div className="mt-2 flex items-end justify-between gap-4 md:mt-1.5">
        <div className="min-w-0">
          <p className="gold-text font-display tnum text-4xl font-semibold leading-none md:text-3xl">
            {usdWhole(totalUsd)}
          </p>
          <p
            className="tnum mt-2 text-sm font-medium md:mt-1.5 md:text-[13px]"
            style={{ color: up ? "var(--chart-up)" : "var(--chart-down)" }}
          >
            {up ? "+" : ""}
            {usd(change24hUsd)}
            <span className="ml-2 text-bone-faint">{pct(changePct)} / 24h</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <TrendLine prev={prevTotalUsd} now={totalUsd} up={up} />
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-bone-faint">
            24h ago to now
          </p>
        </div>
      </div>
      <p className="mt-3 border-t border-steel-line pt-2.5 text-[11px] leading-relaxed text-bone-faint md:mt-2 md:pt-2">
        Live snapshot of on-chain balances. The 24h figure uses provider rate
        moves; longer performance history is not tracked, so nothing here is
        reconstructed or estimated.
      </p>
    </Card>
  );
}
