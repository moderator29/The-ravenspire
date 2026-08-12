"use client";

import { TokenLogo } from "@/components/wallet/token-logo";
import type { PositionToken } from "@/app/api/profile/earnings/types";

/* Holdings rows for The Coffers: token logo, symbol + chain, amount held, and
   USD value with its 24h drift. Purely presentational; the privacy gate and
   the real balances are resolved server-side in the positions route. */

const usd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);

const pct = (n: number): string =>
  `${n >= 0 ? "+" : ""}${n.toFixed(n <= -10 || n >= 10 ? 0 : 1)}%`;

export function PositionsList({
  tokens,
  max = 6,
}: {
  tokens: PositionToken[];
  max?: number;
}) {
  const rows = tokens.slice(0, max);

  return (
    <ul className="flex flex-col divide-y divide-steel-line/50">
      {rows.map((t) => {
        const up = t.change24h >= 0;
        return (
          <li key={t.key} className="flex items-center gap-3 py-2.5">
            <div className="relative shrink-0">
              <TokenLogo logo={t.logo} symbol={t.symbol} size={34} />
              <span className="absolute -bottom-1 -right-1 rounded-full border border-steel-line bg-void px-1 text-[8px] font-semibold uppercase tracking-wide text-bone-faint">
                {t.chainShort}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-bone">
                {t.symbol}
              </p>
              <p className="tnum truncate text-xs text-bone-faint">
                {t.amount} {t.symbol}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="tnum text-sm font-semibold text-bone">
                {usd(t.valueUsd)}
              </p>
              {t.change24h !== 0 && (
                <p
                  className={`tnum text-xs ${up ? "text-gold" : "text-ember"}`}
                >
                  {pct(t.change24h)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
