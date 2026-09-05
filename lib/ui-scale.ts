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
 * touch:min-w-11`, itself rem-based) shrinks along with everything else, to
 * about 38.5px, at Compact. On the founder's explicit direction Compact now
 * ships as the platform's own default rather than sitting behind an opt in,
 * which trades a small amount of touch-target headroom for a denser feel on
 * every first visit. A member who wants the full 44px floor back sizes up to
 * Default or Comfortable in Settings; nothing here is one way.
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

/* SHIPPED_DEFAULT is what a member gets before they have ever touched
   Settings, not the tier literally named "default" in the type above (that
   name is now just the middle rung of the three, unchanged at 100%). */
const SHIPPED_DEFAULT: UIScale = "compact";

export function readUIScale(): UIScale {
  try {
    const raw = window.localStorage.getItem(UI_SCALE_KEY);
    return isUIScale(raw) ? raw : SHIPPED_DEFAULT;
  } catch {
    return SHIPPED_DEFAULT;
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
   script in the layout and this module can never disagree about what a
   missing or bad stored value falls back to (SHIPPED_DEFAULT, same as
   readUIScale above). Deliberately tiny and dependency free: it runs before
   React, before Tailwind's own runtime, before anything else on the page. */
export function uiScaleInitScript(): string {
  return `(function(){try{var s=window.localStorage.getItem(${JSON.stringify(
    UI_SCALE_KEY
  )});var m=${JSON.stringify(UI_SCALE_PCT)};var pct=m[s]||m[${JSON.stringify(
    SHIPPED_DEFAULT
  )}];document.documentElement.style.fontSize=pct+"%";}catch(e){}})();`;
}
