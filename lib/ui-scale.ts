/* The member's own interface size, applied as a root font-size percentage.
 *
 * WHY THE ROOT FONT SIZE, AND NOT --spacing. AGENTS.md is explicit that
 * Tailwind's global --spacing token has never been overridden, and that
 * doing so "breaks every existing p-4 at once", tracked as a deliberate
 * future mechanical pass rather than something to do in passing. This is a
 * different lever: every rem-based utility this app emits, spacing and type
 * size alike, resolves relative to the ROOT element's font-size in Tailwind
 * v4, so scaling that one CSS property scales the whole rendered interface
 * together without touching the --spacing token or any component.
 *
 * THE TOUCH FLOOR TRADEOFF, STATED ONCE. The 44px minimum (`touch:min-h-11
 * touch:min-w-11`, itself rem-based) shrinks along with everything else when
 * a member picks Compact. That is acceptable here in a way it would not be
 * as a shipped default: it is the member's own deliberate choice, made in
 * Settings, not a regression nobody agreed to. The shipped default is
 * "default", 100%, which is the accessible baseline this pass is not
 * touching.
 *
 * THE RANGE IS DELIBERATELY NARROW. Three steps, 87.5 to 112.5 percent, is
 * enough to feel like a real choice without ever making the product
 * unusable at either end. */

export type UIScale = "compact" | "default" | "comfortable";

export const UI_SCALE_KEY = "rvn_ui_scale_v1";

export const UI_SCALE_PCT: Record<UIScale, number> = {
  compact: 87.5,
  default: 100,
  comfortable: 112.5,
};

const VALID: readonly UIScale[] = ["compact", "default", "comfortable"];

export function isUIScale(value: unknown): value is UIScale {
  return typeof value === "string" && (VALID as readonly string[]).includes(value);
}

export function readUIScale(): UIScale {
  try {
    const raw = window.localStorage.getItem(UI_SCALE_KEY);
    return isUIScale(raw) ? raw : "default";
  } catch {
    return "default";
  }
}

/* Sets the root font-size directly. Called from the no-flash inline script
   in app/layout.tsx before hydration, and again from the Settings control
   the moment a member changes it, so the two paths share one definition of
   what a scale means rather than drifting apart. */
export function applyUIScale(scale: UIScale): void {
  document.documentElement.style.fontSize = `${UI_SCALE_PCT[scale]}%`;
}

export function writeUIScale(scale: UIScale): void {
  try {
    window.localStorage.setItem(UI_SCALE_KEY, scale);
  } catch {
    /* storage unavailable; the choice still applies for this visit */
  }
  applyUIScale(scale);
}

/* The exact source the no-flash script runs, as a string, so the inline
   script in the layout and this module can never disagree about what
   "default" or a bad value falls back to. Deliberately tiny and dependency
   free: it runs before React, before Tailwind's own runtime, before
   anything else on the page. */
export function uiScaleInitScript(): string {
  return `(function(){try{var s=window.localStorage.getItem(${JSON.stringify(
    UI_SCALE_KEY
  )});var m=${JSON.stringify(UI_SCALE_PCT)};if(s&&m[s]){document.documentElement.style.fontSize=m[s]+"%";}}catch(e){}})();`;
}
