"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { EVM_CHAINS } from "@/components/wallet/chains";

export interface TokenFilters {
  chains: number[]; // empty => all chains
  hideSmall: boolean;
}

/* A compact, non-intrusive filter control for the coin list. Renders as a
   single pill button that opens a small popover with chain chips and a
   hide-small-balances toggle, so the list stays clean and the filters never
   crowd the layout. Closes on outside click or Escape. */
export function TokenFilter({
  value,
  onChange,
}: {
  value: TokenFilters;
  onChange: (next: TokenFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount =
    (value.chains.length > 0 ? 1 : 0) + (value.hideSmall ? 1 : 0);

  const toggleChain = (id: number) => {
    const has = value.chains.includes(id);
    onChange({
      ...value,
      chains: has
        ? value.chains.filter((c) => c !== id)
        : [...value.chains, id],
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filter tokens"
        className={`btn-glass inline-flex h-8 items-center gap-1.5 px-2.5 text-xs ${
          activeCount > 0 ? "border-gold/45 text-gold" : ""
        }`}
      >
        <Icon name="sliders" className="h-3.5 w-3.5" />
        Filter
        {activeCount > 0 ? (
          <span className="tnum ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-[#171204]">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="glass absolute right-0 top-10 z-30 w-64 p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
            Chains
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EVM_CHAINS.map((c) => {
              const on =
                value.chains.length === 0 || value.chains.includes(c.id);
              const explicit = value.chains.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChain(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    explicit
                      ? "border-gold/50 bg-panel-warm text-gold"
                      : on
                        ? "border-steel-line bg-panel/50 text-bone-mut"
                        : "border-steel-line bg-panel/30 text-bone-faint"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {value.chains.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, chains: [] })}
              className="mt-2 text-[11px] font-medium text-gold hover:underline"
            >
              Show all chains
            </button>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-steel-line/60 pt-3">
            <span className="text-xs text-bone-mut">Hide small balances</span>
            <button
              type="button"
              role="switch"
              aria-checked={value.hideSmall}
              onClick={() => onChange({ ...value, hideSmall: !value.hideSmall })}
              className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                value.hideSmall
                  ? "border-gold/50 bg-gold/30"
                  : "border-steel-line bg-panel"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-gold transition-all ${
                  value.hideSmall ? "left-4" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
