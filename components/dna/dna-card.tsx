"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { DnaResult } from "@/components/dna/types";

/* The premium result card. Numbers here are real, computed server-side; the
   archetype, trait chips and narrative are the model's read of those facts. */

export function DnaCard({ result }: { result: DnaResult }) {
  const [copied, setCopied] = useState(false);
  const isWallet = result.kind === "wallet";

  async function share() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/dna?q=${encodeURIComponent(result.subject)}`
        : "";
    const text = `${result.shareText}${url ? `\n${url}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="glass overflow-hidden">
      {/* Header band */}
      <div className="relative border-b border-gold/15 px-5 py-6 sm:px-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 15% -10%, rgba(200,162,76,0.14), transparent 60%)",
          }}
        />
        <div className="relative flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-panel">
            <Icon
              name={isWallet ? "wallet" : "user"}
              className="h-5 w-5 text-gold"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.26em] text-bone-faint">
              {isWallet ? "Wallet DNA" : "Social DNA"}
            </p>
            <h2 className="gold-text font-display text-2xl font-semibold leading-tight">
              {result.archetype}
            </h2>
            <p className="tnum mt-1 truncate text-xs text-bone-mut">
              {result.subject}
            </p>
          </div>
        </div>

        {/* Trait chips */}
        <div className="relative mt-4 flex flex-wrap gap-2">
          {result.traits.map((t) => (
            <span
              key={t}
              className="rounded-full border border-gold/25 bg-panel-warm px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-bone"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Narrative */}
      <div className="px-5 py-5 sm:px-7">
        <p className="text-[15px] leading-relaxed text-bone">
          {result.narrative}
        </p>

        {result.sparse && (
          <div className="glass-warm mt-4 flex items-start gap-2.5 p-3">
            <Icon
              name="eye"
              className="mt-0.5 h-4 w-4 shrink-0 text-bone-faint"
            />
            <p className="text-xs text-bone-mut">
              The sources came back thin for this one, so the read stays honest:
              a quiet or fresh profile, nothing invented to fill the gap.
            </p>
          </div>
        )}
      </div>

      {/* Data points */}
      {result.dataPoints.length > 0 && (
        <div className="grid grid-cols-2 gap-px border-t border-steel-line/60 bg-steel-line/40 sm:grid-cols-3">
          {result.dataPoints.map((d) => (
            <div key={d.label} className="bg-void px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                {d.label}
              </p>
              <p className="mt-1 text-sm font-medium text-bone">{d.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-steel-line/60 px-5 py-4 sm:px-7">
        <p className="text-[11px] text-bone-faint">
          Read from real {isWallet ? "on-chain" : "platform"} data.
        </p>
        <button
          type="button"
          onClick={() => void share()}
          className="btn-glass rounded-full px-4 py-2 text-xs font-medium text-bone"
        >
          <Icon name="share" className="h-4 w-4 text-gold" />
          {copied ? "Copied" : "Share"}
        </button>
      </div>
    </div>
  );
}
