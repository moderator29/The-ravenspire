"use client";

import { Sheet } from "@/components/ui/sheet";
import { SegmentedControl } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/field";
import {
  VOICES,
  LENGTHS,
  type Voice,
  type Length,
} from "@/components/raven/types";

/**
 * The Raven's AI settings. Voice, live browsing and response length live here,
 * with room to grow. The parent owns the values and persistence; this surface
 * only presents them.
 *
 * This was a hand rolled side panel: its own backdrop button, its own Escape
 * listener, its own header, and a local `SegButton` that rebuilt the button
 * chassis in two states. None of it had a focus trap or focus restore, so
 * dismissing the panel dropped keyboard focus back to the top of the document.
 * It is now the `Sheet` primitive, which carries all of that.
 *
 * The two control groups also changed shape to match what they actually are.
 * Voice and response length are few and mutually exclusive, which is a
 * `SegmentedControl`, not a row of independent buttons each carrying
 * `aria-pressed`. Live browsing is a boolean, which is a `Toggle` with
 * `role="switch"`, not a button whose label flips between On and Off.
 */
export function SettingsSheet({
  open,
  onClose,
  voice,
  browse,
  length,
  onVoice,
  onBrowse,
  onLength,
}: {
  open: boolean;
  onClose: () => void;
  voice: Voice;
  browse: boolean;
  length: Length;
  onVoice: (v: Voice) => void;
  onBrowse: (b: boolean) => void;
  onLength: (l: Length) => void;
}) {
  const activeVoice = VOICES.find((v) => v.id === voice) ?? VOICES[0];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="right"
      title="AI settings"
      description="Remembered on this device"
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
              Voice
            </span>
            <span className="truncate text-[11px] text-bone-faint">
              {activeVoice.hint}
            </span>
          </div>
          <SegmentedControl
            label="Voice"
            block
            value={voice}
            onValueChange={(next) => onVoice(next as Voice)}
            items={VOICES.map((v) => ({ value: v.id, label: v.label }))}
          />
        </section>

        <section className="flex items-center justify-between gap-3 border-t border-steel-line/60 pt-5">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
              Live browsing
            </span>
            <p className="mt-0.5 text-[11px] text-bone-faint">
              Let the Raven search the live web for current answers.
            </p>
          </div>
          <Toggle
            checked={browse}
            onCheckedChange={onBrowse}
            label="Live browsing"
          />
        </section>

        <section className="flex flex-col gap-2.5 border-t border-steel-line/60 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
            Response length
          </span>
          <SegmentedControl
            label="Response length"
            block
            value={length}
            onValueChange={(next) => onLength(next as Length)}
            items={LENGTHS.map((l) => ({ value: l.id, label: l.label }))}
          />
        </section>

        <section className="border-t border-steel-line/60 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
            More coming
          </span>
          <p className="mt-1 text-[11px] leading-relaxed text-bone-faint">
            Memory, tone presets and realm context controls will land on this
            perch soon.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
