"use client";

import { useState } from "react";
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
    <section className="glass p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.26em] text-bone-faint">
          Allocation
        </h2>
        <div className="flex rounded-full border border-steel-line bg-panel p-0.5 text-[11px]">
          {(["asset", "chain"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 font-medium capitalize transition-colors ${
                mode === m
                  ? "bg-gold/15 text-gold"
                  : "text-bone-faint hover:text-bone-mut"
              }`}
            >
              By {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative shrink-0">
          <Donut slices={slices} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="tnum font-display text-lg font-semibold text-bone">
              {slices.length}
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-bone-faint">
              {mode === "asset" ? "assets" : "chains"}
            </span>
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-2.5">
          {slices.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
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
    </section>
  );
}
