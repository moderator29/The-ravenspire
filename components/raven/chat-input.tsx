"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * The bottom composer: a full-width, rounded input with the send button
 * attached inside it and the live-browsing toggle as a small inline control,
 * ChatGPT style. Auto-grows with content. The parent owns the draft and the
 * browse flag so this stays a controlled, presentational surface.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  busy,
  browse,
  onToggleBrowse,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  browse: boolean;
  onToggleBrowse: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  const reset = () => {
    if (areaRef.current) areaRef.current.style.height = "auto";
  };

  const canSend = value.trim().length > 0 && !busy;

  return (
    <form
      className="pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        onSend();
        reset();
      }}
    >
      <div className="glass-sm flex flex-col gap-2 px-3 py-2.5 focus-within:border-gold/35">
        <textarea
          ref={areaRef}
          value={value}
          rows={1}
          placeholder="Speak to the Raven..."
          onChange={(e) => {
            onChange(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!canSend) return;
              onSend();
              reset();
            }
          }}
          className="max-h-[168px] min-h-[24px] w-full resize-none bg-transparent px-1.5 text-sm leading-relaxed text-bone placeholder:text-bone-faint focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleBrowse}
            aria-pressed={browse}
            title="Toggle live web browsing"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              browse
                ? "border-gold/45 bg-panel-warm text-gold"
                : "border-steel-line/70 bg-panel text-bone-mut hover:border-gold/30 hover:text-bone"
            }`}
          >
            <Icon name="search" className="h-3.5 w-3.5" />
            {browse ? "Browsing on" : "Browse"}
          </button>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send to the Raven"
            className="btn-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-xl p-0 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Icon name="send" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 px-2 text-center text-[10px] text-bone-faint">
        The Raven can be wrong. Verify anything that moves coin.
      </p>
    </form>
  );
}
