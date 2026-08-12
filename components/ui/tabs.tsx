"use client";

import { createContext, useCallback, useContext, useId, useState } from "react";
import type { ReactNode } from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { motion } from "framer-motion";
import { cx } from "@/components/ui/cx";

/* Tabs on Base UI Tabs, with a gold underline that slides.

   What this replaces, in the feed alone: five plain `<button>` elements with
   no `role="tablist"`, no `aria-selected`, no `tabindex` management and no
   arrow key navigation, so a keyboard user tabbed through all five one at a
   time and a screen reader was told nothing about which was current. Base UI
   supplies the entire contract; this file supplies only the look.

   The underline is framer-motion `layoutId` rather than Base UI's
   `Tabs.Indicator`, because layout animation interpolates position and width
   together in one spring-free 220ms transform and survives the tab strip
   reflowing on a horizontal scroll, which the CSS variable approach does not.

   Note this component mirrors the active value in its own state even when
   controlled. It needs to know which tab is active in React, not just in CSS,
   because `layoutId` has to be mounted inside the active tab. */

type TabsContextValue = {
  value: string;
  layoutId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(part: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`Ravenspire: <${part}> must be rendered inside <Tabs>.`);
  }
  return ctx;
}

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: ReactNode;
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: TabsProps) {
  const layoutId = useId();
  const [internal, setInternal] = useState<string>(defaultValue ?? "");
  const current = value ?? internal;

  const handleChange = useCallback(
    (next: BaseTabs.Tab.Value) => {
      const asString = String(next);
      setInternal(asString);
      onValueChange?.(asString);
    },
    [onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value: current, layoutId }}>
      <BaseTabs.Root
        value={current}
        onValueChange={handleChange}
        className={cx("flex flex-col", className)}
      >
        {children}
      </BaseTabs.Root>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseTabs.List
      className={cx(
        "scrollbar-none relative flex items-center gap-1 overflow-x-auto",
        "border-b border-steel-line",
        className
      )}
    >
      {children}
    </BaseTabs.List>
  );
}

export function Tab({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const { value: active, layoutId } = useTabsContext("Tab");
  const isActive = active === value;

  return (
    <BaseTabs.Tab
      value={value}
      className={cx(
        "relative shrink-0 rounded-t-md px-3 py-2.5 text-sm font-semibold",
        /* 44px on a finger. The compact height is right for a mouse and a tab
           is a primary navigation control, so it must not be the thing a thumb
           misses. See the `touch` variant in globals.css. */
        "touch:min-h-11",
        "transition-colors duration-fast ease-out-quint",
        "text-bone-faint hover:text-bone-mut data-active:text-bone",
        className
      )}
    >
      {children}
      {isActive ? (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className="absolute inset-x-2 -bottom-px h-[2px] rounded-[var(--radius-full)] bg-[image:linear-gradient(90deg,var(--gold-deep),var(--gold)_55%,var(--gold-bright))]"
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        />
      ) : null}
    </BaseTabs.Tab>
  );
}

export function TabsPanel({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  /* Deliberately no `outline-none` here. Base UI gives the panel a tabindex so
     a keyboard user can reach its content directly from the tab strip, which
     means it is a focus target and the global focus-visible ring has to be
     allowed to draw on it. */
  return (
    <BaseTabs.Panel value={value} className={className}>
      {children}
    </BaseTabs.Panel>
  );
}

export interface SegmentedControlItem {
  value: string;
  label: ReactNode;
}

export interface SegmentedControlProps {
  items: SegmentedControlItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: "sm" | "md";
  /* Stretches each segment to an equal share of the width. The right choice
     for a two or three way switcher that owns its row on mobile. */
  block?: boolean;
  className?: string;
  /* Names the group for screen readers, for example "Crest filter". */
  label?: string;
}

/* The boxed switcher, for Earned / Locked / All and its relatives.

   Same Base UI Tabs contract underneath as the underline variant, so it is a
   real tablist with arrow keys, and the moving element is a background slab
   rather than a rule. Rounded rectangles throughout: the track is
   `--radius-md` and each segment is `--radius-sm`, never a capsule. */
export function SegmentedControl({
  items,
  value,
  defaultValue,
  onValueChange,
  size = "md",
  block,
  className,
  label,
}: SegmentedControlProps) {
  const layoutId = useId();
  const [internal, setInternal] = useState<string>(
    defaultValue ?? items[0]?.value ?? ""
  );
  const current = value ?? internal;

  return (
    <BaseTabs.Root
      value={current}
      onValueChange={(next) => {
        const asString = String(next);
        setInternal(asString);
        onValueChange?.(asString);
      }}
      className={cx("inline-flex", block && "flex w-full", className)}
    >
      <BaseTabs.List
        aria-label={label}
        className={cx(
          "flex w-full items-center gap-0.5 rounded-md border border-steel-line bg-obsidian/70 p-1"
        )}
      >
        {items.map((item) => {
          const isActive = current === item.value;
          return (
            <BaseTabs.Tab
              key={item.value}
              value={item.value}
              className={cx(
                "relative shrink-0 rounded-sm font-semibold",
                "touch:min-h-11",
                "transition-colors duration-fast ease-out-quint",
                block && "flex-1",
                size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
                isActive ? "text-gold-ink" : "text-bone-mut hover:text-bone"
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className="absolute inset-0 rounded-sm shadow-forge bg-[image:linear-gradient(180deg,var(--gold-bright)_0%,var(--gold)_48%,var(--gold-deep)_100%)]"
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </BaseTabs.Tab>
          );
        })}
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}
