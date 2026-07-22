"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";
import {
  VOICES,
  LENGTHS,
  type Voice,
  type Length,
} from "@/components/raven/types";

function SegButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border border-gold/45 bg-panel-warm text-gold"
          : "border border-steel-line/70 bg-panel text-bone-mut hover:border-gold/30 hover:text-bone"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The Raven's AI settings, lifted off the chat view into a right-side sheet.
 * Voice, live browsing and response length live here, with room to grow.
 * The parent owns the values and persistence; this surface only presents them.
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeVoice = VOICES.find((v) => v.id === voice) ?? VOICES[0];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label="AI settings"
        className="relative flex h-full w-[340px] max-w-[88vw] flex-col border-l border-gold/20 bg-obsidian/95 shadow-2xl backdrop-blur-xl"
      >
        <header className="flex items-center justify-between border-b border-steel-line/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/30 bg-panel-warm">
              <Icon name="sliders" className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-bone">
                AI settings
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                Remembered on this device
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-steel-line/70 text-bone-mut transition-colors hover:border-gold/35 hover:text-bone"
          >
            <Icon name="plus" className="h-4 w-4 rotate-45" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          {/* Voice */}
          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
                Voice
              </span>
              <span className="truncate text-[11px] text-bone-faint">
                {activeVoice.hint}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {VOICES.map((v) => (
                <SegButton
                  key={v.id}
                  active={voice === v.id}
                  title={v.hint}
                  onClick={() => onVoice(v.id)}
                >
                  {v.label}
                </SegButton>
              ))}
            </div>
          </section>

          {/* Live browsing */}
          <section className="flex items-center justify-between gap-3 border-t border-steel-line/60 pt-5">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
                Live browsing
              </span>
              <p className="mt-0.5 text-[11px] text-bone-faint">
                Let the Raven search the live web for current answers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onBrowse(!browse)}
              aria-pressed={browse}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                browse
                  ? "border-gold/45 bg-panel-warm text-gold"
                  : "border-steel-line/70 bg-panel text-bone-mut hover:border-gold/30 hover:text-bone"
              }`}
            >
              <Icon name="search" className="h-3.5 w-3.5" />
              {browse ? "On" : "Off"}
            </button>
          </section>

          {/* Response length */}
          <section className="flex flex-col gap-2.5 border-t border-steel-line/60 pt-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-mut">
              Response length
            </span>
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((l) => (
                <SegButton
                  key={l.id}
                  active={length === l.id}
                  onClick={() => onLength(l.id)}
                >
                  {l.label}
                </SegButton>
              ))}
            </div>
          </section>

          {/* Room for more settings */}
          <section className="mt-auto border-t border-steel-line/60 pt-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
              More coming
            </span>
            <p className="mt-1 text-[11px] leading-relaxed text-bone-faint">
              Memory, tone presets and realm context controls will land on this
              perch soon.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
