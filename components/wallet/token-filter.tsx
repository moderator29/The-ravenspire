"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button, INLINE_TOUCH_TARGET } from "@/components/ui/button";
import { Toggle } from "@/components/ui/field";
import { Chip } from "@/components/console/console-shell";
import { EVM_CHAINS } from "@/components/wallet/chains";

export interface TokenFilters {
  chains: number[]; // empty => all chains
  hideSmall: boolean;
}

/* The coin list's filter control. A single rounded rectangle button that opens
   a popover anchored to its own trigger inside a relative box, holding the
   chain chips and the hide-small-balances toggle, so the filters never crowd
   the list. Closes on outside click or Escape. */
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
      <Button
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...(activeCount > 0 ? { tone: "gold" as const } : {})}
        className={activeCount > 0 ? "text-gold" : undefined}
      >
        <Icon name="sliders" aria-hidden className="h-3.5 w-3.5" />
        Filter
        {activeCount > 0 ? (
          <span className="tnum ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-gold px-1 text-[10px] font-semibold text-gold-ink">
            {activeCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="z-dropdown absolute right-0 top-10 w-64 rounded-xl border border-gold/20 bg-panel/95 p-3 shadow-lifted backdrop-blur-[18px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
            Chains
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EVM_CHAINS.map((c) => (
              <Chip
                key={c.id}
                active={value.chains.includes(c.id)}
                onClick={() => toggleChain(c.id)}
                className="h-8 md:h-7"
              >
                {c.name}
              </Chip>
            ))}
          </div>
          {value.chains.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, chains: [] })}
              className={`${INLINE_TOUCH_TARGET} mt-2 text-[11px] font-medium text-gold hover:underline`}
            >
              Show all chains
            </button>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-steel-line/60 pt-3">
            <span className="text-xs text-bone-mut">Hide small balances</span>
            <Toggle
              size="sm"
              label="Hide small balances"
              checked={value.hideSmall}
              onCheckedChange={(next) =>
                onChange({ ...value, hideSmall: next })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
