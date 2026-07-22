"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

/* Shared chrome for the settings experience so every card, row, toggle, and
   section header speak the same visual language across page.tsx and the
   Privy-powered security section. */

export function SectionHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 px-1 pt-2">
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-bone-mut">
        {title}
      </h2>
      {hint ? (
        <span className="text-[11px] text-bone-faint">{hint}</span>
      ) : null}
      <span className="h-px flex-1 bg-steel-line" />
    </div>
  );
}

export function Card({
  icon,
  title,
  plain,
  warm,
  children,
}: {
  icon: string;
  title: string;
  plain?: string;
  warm?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`glass p-5 sm:p-6 ${warm ? "glass-warm" : ""}`}>
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          {title}
        </h2>
        {plain ? (
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            {plain}
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-steel-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm text-bone">{title}</p>
        {desc ? <p className="mt-0.5 text-xs text-bone-faint">{desc}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        on ? "border-gold bg-gold/25" : "border-steel-line bg-panel"
      }`}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all ${
          on ? "left-6 bg-gold-bright" : "left-1 bg-bone-faint"
        }`}
      />
    </button>
  );
}

/* Small pill used to show a linked/enrolled status at a glance. */
export function StatusPill({
  tone,
  children,
}: {
  tone: "on" | "off";
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] ${
        tone === "on"
          ? "border-gold/40 bg-gold/10 text-gold"
          : "border-steel-line bg-panel text-bone-faint"
      }`}
    >
      {children}
    </span>
  );
}
