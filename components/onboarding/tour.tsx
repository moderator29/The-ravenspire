"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "The Ravenry",
    text: "The feed where the realm speaks. Posts, replies, and ravens carrying word from every House.",
  },
  {
    title: "Calls",
    text: "Sealed against live prices and judged by truth. Make your call, let the market prove you right or wrong.",
  },
  {
    title: "Houses and the Throne",
    text: "Your banner and your Season. Fight for your House and climb toward the Throne before the Season ends.",
  },
  {
    title: "The War",
    text: "Where Glory is won by hand. Battle, earn gold, open chests, and build mastery champion by champion.",
  },
  {
    title: "@raven",
    text: "The Herald who answers everything. Mention @raven anywhere in the realm and the Herald will reply.",
  },
];

/* The welcome tour, on Base UI Dialog rather than a hand rolled overlay.
 *
 * The hand rolled version claimed `aria-modal` at `z-50` while the mobile dock
 * paints at `z-nav` (200), so the one surface that told assistive tech
 * "nothing else is reachable" was itself painted under a row of five fully
 * clickable tabs. It also trapped no focus and answered no Escape, which made
 * the claim doubly false. Dialog portals to document.body, traps and restores
 * focus, closes on Escape, and the viewport sits on the z-modal rung where a
 * modal belongs. Escape and the backdrop both read as "skip", the same choice
 * the Skip button offers, because a tour a member is trying to leave has
 * already finished its job. */
export function Tour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();
  const last = step === steps.length - 1;
  const current = steps[step];

  const next = () => {
    if (last) onDone();
    else setStep((s) => s + 1);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={
            "fixed inset-0 z-overlay bg-black/70 backdrop-blur-sm " +
            "transition-opacity duration-base ease-out-quint " +
            "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast"
          }
        />
        <Dialog.Viewport className="fixed inset-0 z-modal flex items-center justify-center px-4">
          <Dialog.Popup className="w-full max-w-sm outline-none">
            <Card
              key={step}
              pad="xl"
              render={
                <motion.div
                  initial={
                    reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                />
              }
              className="w-full text-center"
            >
              <div
                className="mb-4 flex items-center justify-center gap-1.5"
                aria-label={`Step ${step + 1} of ${steps.length}`}
              >
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      i === step ? "bg-gold" : "bg-steel-line"
                    }`}
                  />
                ))}
              </div>
              <Dialog.Title
                render={
                  <h2 className="font-display text-xl font-semibold text-bone" />
                }
              >
                {current.title}
              </Dialog.Title>
              <Dialog.Description
                render={
                  <p className="mt-2 text-sm leading-relaxed text-bone-mut" />
                }
              >
                {current.text}
              </Dialog.Description>
              <div className="mt-6 flex items-center gap-3">
                {!last && (
                  <Button
                    variant="glass"
                    size="md"
                    className="text-bone-mut"
                    onClick={onDone}
                  >
                    Skip
                  </Button>
                )}
                <Button variant="gold" size="md" className="flex-1" onClick={next}>
                  {last ? "Begin my reign" : "Next"}
                </Button>
              </div>
            </Card>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
