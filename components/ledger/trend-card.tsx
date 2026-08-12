"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { PriceChart } from "@/components/coin/price-chart";
import { realmFetch } from "@/lib/auth/api";

/* The Ledger's 30-day portfolio value trend: a sparkline plus real 7d and 30d
   PnL, aggregated daily across every chain (value over time, from GoldRush
   portfolio history). Renders nothing until there is a real series to draw. */

interface TrendPoint {
  t: number;
  v: number;
}
interface Trend {
  series: TrendPoint[];
  change7dPct: number | null;
  change30dPct: number | null;
  change7dUsd: number | null;
  change30dUsd: number | null;
}

function Delta({ pct, usd }: { pct: number | null; usd: number | null }) {
  if (pct === null) return <span className="text-bone-faint">n/a</span>;
  const up = pct >= 0;
  return (
    <span style={{ color: up ? "var(--chart-up)" : "var(--chart-down)" }}>
      {up ? "+" : ""}
      {pct.toFixed(2)}%
      {usd !== null && (
        <span className="ml-1 text-bone-faint">
          ({up ? "+" : "-"}$
          {Math.abs(usd).toLocaleString("en-US", { maximumFractionDigits: 0 })})
        </span>
      )}
    </span>
  );
}

export function TrendCard({ address }: { address: string }) {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await realmFetch<{ trend?: Trend | null }>(
        `/api/ledger/trend?address=${address}`
      );
      if (cancelled) return;
      setTrend(res.data?.trend ?? null);
      setDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!done || !trend || trend.series.length < 2) return null;

  const points = trend.series.map((p) => ({ t: p.t, c: p.v }));
  const up = (trend.change30dPct ?? 0) >= 0;

  return (
    <Card pad="none" className="p-4 md:p-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Portfolio value · 30 days
      </p>
      <div className="mt-2.5 md:mt-2">
        <PriceChart points={points} up={up} height={96} />
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-steel-line pt-2.5 text-sm md:mt-2 md:pt-2 md:text-[13px]">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
            7 day
          </p>
          <p className="tnum mt-0.5 font-semibold">
            <Delta pct={trend.change7dPct} usd={trend.change7dUsd} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
            30 day
          </p>
          <p className="tnum mt-0.5 font-semibold">
            <Delta pct={trend.change30dPct} usd={trend.change30dUsd} />
          </p>
        </div>
      </div>
    </Card>
  );
}
