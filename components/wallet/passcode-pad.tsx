"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";

/* The iOS-style passcode entry: dot indicators above a numeric pad, with a
   reveal toggle that swaps the dots for the digits themselves. Rounded
   rectangle keys throughout, never circles: rule 9 exempts avatars and true
   circular icon buttons, and a numpad key is neither, so the keys read as the
   realm's own glass chrome rather than a borrowed iOS shape.

   Fully self contained; the parent only learns of a completed 6-digit entry
   via `onComplete`. To clear the entered digits, for a wrong attempt or a
   step change (create -> confirm), give this component a fresh `key` at the
   call site rather than passing it a "reset" prop: a key change is React's
   own idiom for "start this over," and it needs no effect in here to notice
   a prop changed and race to undo the render that just happened. */
export function PasscodePad({
  length = 6,
  onComplete,
  disabled = false,
  shake = false,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  /* Plays a brief shake on the dot row, for a wrong passcode. */
  shake?: boolean;
}) {
  const [digits, setDigits] = useState("");
  const [reveal, setReveal] = useState(false);

  const push = (d: string) => {
    if (disabled || digits.length >= length) return;
    const next = digits + d;
    setDigits(next);
    if (next.length === length) onComplete(next);
  };

  const backspace = () => setDigits((cur) => cur.slice(0, -1));

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className={cx("flex items-center gap-3", shake && "vault-pin-shake")}
      >
        {Array.from({ length }).map((_, i) => {
          const filled = i < digits.length;
          return reveal ? (
            <span
              key={i}
              className="tnum flex h-9 w-8 items-center justify-center rounded-md border border-steel-line bg-panel/50 text-base font-semibold text-bone"
            >
              {filled ? digits[i] : ""}
            </span>
          ) : (
            <span
              key={i}
              aria-hidden
              className={cx(
                "h-3 w-3 rounded-[var(--radius-full)] border transition-[background-color,border-color] duration-fast",
                filled
                  ? "border-gold bg-gold"
                  : "border-steel-line bg-transparent"
              )}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setReveal((r) => !r)}
        className="text-xs font-semibold text-bone-faint transition-colors duration-fast hover:text-bone-mut"
      >
        {reveal ? "Hide passcode" : "Show passcode"}
      </button>

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <NumKey key={n} label={n} onClick={() => push(n)} disabled={disabled} />
        ))}
        <span aria-hidden />
        <NumKey label="0" onClick={() => push("0")} disabled={disabled} />
        <button
          type="button"
          aria-label="Delete digit"
          onClick={backspace}
          disabled={disabled || digits.length === 0}
          className="touch:min-h-11 touch:min-w-11 flex h-14 w-16 items-center justify-center rounded-lg text-bone-faint transition-colors duration-fast hover:text-bone disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="backspace" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function NumKey({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="touch:min-h-11 touch:min-w-11 flex h-14 w-16 items-center justify-center rounded-lg border border-gold/25 bg-void/60 bg-[image:linear-gradient(180deg,rgba(255,233,163,0.06),rgba(12,12,17,0.4))] text-lg font-semibold text-bone shadow-edge backdrop-blur-[10px] transition-[filter,border-color] duration-fast active:brightness-110 disabled:pointer-events-none disabled:opacity-50"
    >
      {label}
    </button>
  );
}
