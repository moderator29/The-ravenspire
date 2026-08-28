"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* How the realm knows whether "Back" has anywhere to go.

   The old signal was `window.history.length > 1`, which is wrong in both
   directions. A tab opened from another site often arrives with length
   already past one, so Back would retrace a step that leads OUT of the realm;
   and length only ever grows, so after any wandering it says yes forever,
   even when the entry behind us is another origin entirely.

   The standard answer, where the browser has it, is the Navigation API:
   `navigation.canGoBack` is true only when a previous entry exists in this
   tab's same-origin contiguous run, which is precisely "retracing keeps you
   in the realm". Safari and Firefox do not ship it yet, so behind them sits
   this counter: one sessionStorage integer, incremented on every in-app
   route change after the first render. Per tab (sessionStorage), surviving
   reloads (the history entries it counts survive them too), and never read
   as more than a boolean.

   The counter can overcount in one edge: walk forward three pages, press the
   BROWSER back button three times, and the count still says three while the
   entry behind is cross-origin. The Navigation API path is immune, so the
   overcount only exists on browsers without it, and the failure mode is the
   old behaviour on a rarer path, never a trap. */

const DEPTH_KEY = "realm:nav-depth";

function readDepth(): number {
  try {
    return Number(window.sessionStorage.getItem(DEPTH_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeDepth(n: number): void {
  try {
    window.sessionStorage.setItem(DEPTH_KEY, String(n));
  } catch {
    /* storage unavailable; canRetrace falls back to the referrer check */
  }
}

/* True when stepping back stays inside the realm. */
export function canRetrace(): boolean {
  if (typeof window === "undefined") return false;
  const nav = (
    window as { navigation?: { canGoBack?: boolean } }
  ).navigation;
  if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack;
  if (readDepth() > 0) return true;
  /* First page this tab has shown. If the referrer is the realm itself, the
     entry behind us is ours (an anchor navigation, a full reload path). */
  try {
    return (
      document.referrer !== "" &&
      new URL(document.referrer).origin === window.location.origin
    );
  } catch {
    return false;
  }
}

/* Mounted once in the root layout. Renders nothing; counts route changes. */
export function NavDepthTracker() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      /* The landing render of this mount is not a step taken. A fresh tab
         starts at zero; a reload keeps whatever the tab had counted. */
      first.current = false;
      return;
    }
    writeDepth(readDepth() + 1);
  }, [pathname]);
  return null;
}
