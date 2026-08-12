"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Card, type CardTone } from "@/components/ui/card";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { Button } from "@/components/ui/button";

/* The Ceremony register.
 *
 * Ninety percent of the realm is the Ledger: flat, dense, quiet. This is the
 * other ten percent, and the only part anyone will describe to a friend.
 *
 * A Ceremony marks the moments the realm rewards you: a Crest unlocking, a Call
 * resolving, a rank earned, a House overtaking a rival, a season closing. It is
 * the one place where gold, the 3D icon set, glow and heavy motion are all
 * permitted at once, and it works precisely because nowhere else does that.
 *
 * The rule this component exists to enforce: ornament is earned, never ambient.
 * If a Ceremony starts appearing for routine events it stops meaning anything,
 * so it is deliberately awkward to fire. Reach for a toast instead.
 *
 * Motion here is the documented exception to the sub-300ms rule. A reward may
 * take a full second. Under prefers-reduced-motion it degrades to a crossfade
 * rather than disappearing, because the moment still matters.
 *
 * On Base UI Dialog, which it was not, and the gap was not cosmetic. This was
 * a hand rolled `fixed inset-0` overlay carrying `role="dialog"` and
 * `aria-modal="true"` by hand, which is the twentieth such overlay this
 * codebase has had and the reason the Modal primitive exists at all. Measured
 * with the chest Ceremony open on the War's mastery board: focus was never
 * moved into the dialog, and the first three Tab presses landed on Upgrade
 * buttons on the page underneath, with 22 of 24 focusable elements outside the
 * dialog and reachable. Escape did nothing.
 *
 * Base UI supplies the focus entry, the focus restore on close, the Escape
 * handler, the background scroll lock and a real portal to `document.body`,
 * which is also house rule 16. Verified on this component: focus lands on the
 * primary action when it opens, Escape closes it, and focus returns to the
 * control that opened it.
 *
 * The keyboard containment is not Base UI's doing and is not this file's
 * either. It marks the background `aria-hidden` but not `inert`, so the page
 * stayed tabbable, and the Modal primitive leaked identically in the same
 * build. `components/shell/inert-background.tsx` mirrors one attribute onto
 * the other, once, for every dialog in the product.
 *
 * What is kept is the look. The dialog's own entrance is a CSS transition on
 * the scale, matching the Modal, and the springs stay where they carry the
 * Forge register: the 3D icon and the plate. The backdrop is `Dialog.Backdrop`
 * rather than a full bleed `<button aria-label="Dismiss">`, which had been
 * both a 390x844 tap target in the tab order and a second, redundant way to
 * say what `Dialog.Close` already says. */

export type CeremonyTone = "gold" | "ember" | "steel";

/* The ring is Card's `tone`, not a border class. A border class here was
   silently dead: Card's own variant border is emitted later in the stylesheet
   and won every time, so a gold ceremony and an ember one drew the same
   edge. */
const TONES: Record<CeremonyTone, { glow: string; ring: CardTone }> = {
  gold: {
    glow: "radial-gradient(60% 50% at 50% 38%, rgba(217,176,64,0.22), transparent 70%)",
    ring: "gold",
  },
  ember: {
    glow: "radial-gradient(60% 50% at 50% 38%, rgba(229,112,42,0.20), transparent 70%)",
    ring: "ember",
  },
  steel: {
    glow: "radial-gradient(60% 50% at 50% 38%, rgba(116,125,139,0.16), transparent 70%)",
    ring: "steel",
  },
};

export interface CeremonyProps {
  open: boolean;
  onClose: () => void;
  /* The 3D icon is the anchor of the whole moment, at hero size. */
  icon: Icon3DName;
  /* Two lines at most. A Ceremony carries one message, never a paragraph. */
  eyebrow: string;
  title: string;
  body?: string;
  /* One number, when the moment has one. Renown gained, a streak reached, a
     rank. Rendered large because it is the point. */
  figure?: string;
  figureLabel?: string;
  tone?: CeremonyTone;
  action?: { label: string; href?: string; onClick?: () => void };
  secondary?: { label: string; onClick: () => void };
}

export function Ceremony({
  open,
  onClose,
  icon,
  eyebrow,
  title,
  body,
  figure,
  figureLabel,
  tone = "gold",
  action,
  secondary,
}: CeremonyProps) {
  const reduced = useReducedMotion();
  const t = TONES[tone];

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        {/* Dismisses on click, because a reward should never trap you, and
            Base UI wires that up without putting a viewport sized button in
            the tab order to do it. */}
        <Dialog.Backdrop className="fixed inset-0 z-overlay bg-obsidian/85 backdrop-blur-sm transition-opacity duration-base ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast" />
        <Dialog.Viewport className="fixed inset-0 z-modal flex items-center justify-center p-4">
          <Dialog.Popup
            aria-label={title}
            className="w-full max-w-sm transition-opacity duration-base ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast"
          >
          <Card render={<motion.div style={{ boxShadow: "var(--shadow-overlay)" }} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }} animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }} transition={
              reduced
                ? { duration: 0.15 }
                : { type: "spring", visualDuration: 0.42, bounce: 0.22 }
            } />} pad="none" radius="2xl" elevation="overlay" tone={t.ring} className="relative w-full overflow-hidden p-7 text-center">
            {/* Atmosphere sits behind the plate, never on it. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: t.glow }}
            />

            <div className="relative flex flex-col items-center">
              <motion.div
                initial={reduced ? false : { opacity: 0, scale: 0.7, rotate: -6 }}
                animate={reduced ? {} : { opacity: 1, scale: 1, rotate: 0 }}
                transition={
                  reduced
                    ? undefined
                    : { type: "spring", visualDuration: 0.6, bounce: 0.34, delay: 0.06 }
                }
              >
                <Icon3D name={icon} size="hero" priority />
              </motion.div>

              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
                {eyebrow}
              </p>
              <h2 className="gold-text mt-2 font-display text-2xl font-semibold tracking-wide">
                {title}
              </h2>

              {figure && (
                <div className="mt-4">
                  <p className="tnum font-display text-4xl font-semibold text-gold-bright">
                    {figure}
                  </p>
                  {figureLabel && (
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
                      {figureLabel}
                    </p>
                  )}
                </div>
              )}

              {body && (
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-bone-mut">
                  {body}
                </p>
              )}

              <div className="mt-6 flex w-full flex-col gap-2">
                {action && (
                  <Button
                    variant="gold"
                    size="md"
                    onClick={() => {
                      action.onClick?.();
                      if (!action.href) onClose();
                    }}
                    {...(action.href ? { render: <a href={action.href} /> } : {})}
                  >
                    {action.label}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    secondary?.onClick();
                    onClose();
                  }}
                >
                  {secondary?.label ?? "Close"}
                </Button>
              </div>
            </div>
          </Card>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
