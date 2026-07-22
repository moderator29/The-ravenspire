"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { TokenIcon } from "@/components/ledger/token-icon";
import {
  usd,
  pct,
  type Position,
} from "@/components/ledger/portfolio-data";

function ChangePill({ position }: { position: Position }) {
  const p = position.change24h;
  const flat = !Number.isFinite(p) || Math.abs(p) < 0.005;
  const up = p >= 0;
  const tone = flat
    ? "text-bone-faint"
    : up
      ? "text-gold-bright"
      : "text-ember";
  return (
    <div className="text-right">
      <div className={`tnum text-sm ${tone}`}>{usd(position.quoteUsd)}</div>
      <div className={`tnum text-[11px] ${tone}`}>
        {flat ? "0.00%" : pct(p)}
      </div>
    </div>
  );
}

function Row({ position }: { position: Position }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="relative shrink-0">
        <TokenIcon logo={position.logo} symbol={position.symbol} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-bone">
            {position.symbol}
          </span>
          <span className="shrink-0 rounded-full border border-steel-line bg-panel px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-bone-faint">
            {position.chainShort}
          </span>
        </div>
        <div className="truncate text-xs text-bone-faint">
          {position.balanceDisplay} {position.symbol}
          <span className="mx-1 text-steel-line">/</span>
          {position.name}
        </div>
      </div>
      <ChangePill position={position} />
    </div>
  );
}

export function Positions({
  positions,
  dust,
}: {
  positions: Position[];
  dust: Position[];
}) {
  const [showDust, setShowDust] = useState(false);
  const dustTotal = dust.reduce((s, t) => s + t.quoteUsd, 0);

  return (
    <section className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-steel-line px-4 py-3">
        <h2 className="text-xs uppercase tracking-[0.26em] text-bone-faint">
          Positions
        </h2>
        <span className="tnum text-[11px] text-bone-faint">
          {positions.length} held
        </span>
      </div>

      <div className="divide-y divide-steel-line">
        {positions.map((p) => (
          <Row key={p.key} position={p} />
        ))}
      </div>

      {dust.length > 0 && (
        <div className="border-t border-steel-line">
          <button
            type="button"
            onClick={() => setShowDust((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="text-sm text-bone-mut">
              {showDust ? "Hide" : "Show"} dust ({dust.length})
              <span className="ml-1.5 text-xs text-bone-faint">
                under {usd(1)} each
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="tnum text-xs text-bone-faint">
                {usd(dustTotal)}
              </span>
              <Icon
                name="arrow"
                className={`h-4 w-4 text-bone-faint transition-transform ${
                  showDust ? "-rotate-90" : "rotate-90"
                }`}
              />
            </span>
          </button>
          {showDust && (
            <div className="divide-y divide-steel-line/60">
              {dust.map((p) => (
                <Row key={p.key} position={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
