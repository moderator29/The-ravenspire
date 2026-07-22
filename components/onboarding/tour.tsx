"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

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
    <motion.div
      initial={{ opacity: reduce ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <motion.div
        key={step}
        initial={
          reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 8 }
        }
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="glass w-full max-w-sm p-6 text-center"
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
        <h2 className="font-display text-xl font-semibold text-bone">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-bone-mut">
          {current.text}
        </p>
        <div className="mt-6 flex items-center gap-3">
          {!last && (
            <button
              onClick={onDone}
              className="btn-glass px-4 py-2 text-sm text-bone-mut"
            >
              Skip
            </button>
          )}
          <button onClick={next} className="btn-gold flex-1 py-2 text-sm">
            {last ? "Begin my reign" : "Next"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
