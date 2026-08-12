"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/tabs";
import { Donut } from "@/components/ledger/donut";
import { usd, type AllocSlice } from "@/components/ledger/portfolio-data";

/* Allocation panel: one donut, two lenses. "By asset" groups the member's
   holdings by ticker (so USDC across chains reads as one asset); "By chain"
   groups the same value by network. Percentages are of the real total. */
export function Allocation({
  byAsset,
  byChain,
}: {
  byAsset: AllocSlice[];
  byChain: AllocSlice[];
}) {
  const [mode, setMode] = useState<"asset" | "chain">("asset");
  const slices = mode === "asset" ? byAsset : byChain;

  return (
    <Card pad="none" render={<section />} className="p-4 md:p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.26em] text-bone-faint">
          Allocation
        </h2>
        {/* Two exclusive lenses on the same value, so a Segmented control. */}
        <SegmentedControl
          label="Allocation lens"
          size="sm"
          items={[
            { value: "asset", label: "By asset" },
            { value: "chain", label: "By chain" },
          ]}
          value={mode}
          onValueChange={(v) => setMode(v as "asset" | "chain")}
        />
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6 md:mt-3 md:gap-5">
        <div className="relative shrink-0">
          <Donut slices={slices} size={144} thickness={18} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="tnum font-display text-lg font-semibold text-bone">
              {slices.length}
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-bone-faint">
              {mode === "asset" ? "assets" : "chains"}
            </span>
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-2 md:space-y-1">
          {slices.map((s) => (
            <li
              key={s.label}
              className="flex min-h-11 items-center justify-between gap-3 text-sm md:min-h-0 md:text-[13px]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: s.color }}
                />
                <span className="truncate text-bone">{s.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="tnum text-bone-faint">{usd(s.value)}</span>
                <span className="tnum w-12 text-right font-medium text-gold">
                  {s.pct.toFixed(1)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
