"use client";

import { Sheet } from "@/components/ui/sheet";
import { SegmentedControl } from "@/components/ui/tabs";
import { Select, Toggle } from "@/components/ui/field";
import {
  VOICES,
  LENGTHS,
  LANGUAGES,
  type Voice,
  type Length,
  type Language,
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
  language,
  onVoice,
  onBrowse,
  onLength,
  onLanguage,
}: {
  open: boolean;
  onClose: () => void;
  voice: Voice;
  browse: boolean;
  length: Length;
  language: Language;
  onVoice: (v: Voice) => void;
  onBrowse: (b: boolean) => void;
  onLength: (l: Length) => void;
  onLanguage: (l: Language) => void;
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
        {/* A Select, not a segmented control.

            Four segments labelled Default, Lore, Normal and Degen need 278px,
            and the sheet gives them 261px at 390px, so "Degen" ran off the
            right edge of the screen. Nothing reported it: the track's overflow
            is visible, so the document never grew and every overflow check on
            this route read zero.

            Shrinking the segments was the wrong repair. It would have cost the
            44px floor or truncated a label to "Deg...", and a member picking a
            voice they cannot read the name of is worse than one extra tap. The
            hint moves under the control for the same reason, since beside the
            heading it had to truncate too. */}
        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
            Voice
          </span>
          <Select
            value={voice}
            onValueChange={(next) => {
              if (next) onVoice(next as Voice);
            }}
            items={VOICES.map((v) => ({ value: v.id, label: v.label }))}
          />
          <p className="text-[11px] leading-relaxed text-bone-faint">
            {activeVoice.hint}
          </p>
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

        {/* A Select rather than a segmented control, because sixteen options
            do not fit a segmented control at 390px and a wrapped grid of
            sixteen chips would outweigh everything above it. */}
        <section className="flex flex-col gap-2.5 border-t border-steel-line/60 pt-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
            Language
          </span>
          <Select
            value={language}
            onValueChange={(next) => {
              if (next) onLanguage(next as Language);
            }}
            items={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
          />
          <p className="text-[11px] leading-relaxed text-bone-faint">
            The Raven answers in this language whatever you write in. Figures,
            tickers and House names stay as they are.
          </p>
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
