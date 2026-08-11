"use client";

import { useRef } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/**
 * The bottom composer: a full width input with the send control attached inside
 * it and the live browsing toggle as a small inline control. Auto grows with
 * content. The parent owns the draft and the browse flag so this stays a
 * controlled, presentational surface.
 *
 * Converted off two hand rolled controls. The send button pasted in `btn-gold`
 * at a hardcoded `rounded-xl`, which predates the radius scale, and the browse
 * toggle rebuilt the button chassis inline in two states. Both now come off the
 * primitive layer, so the focus ring, the disabled treatment and the radius are
 * the same ones the rest of the realm uses.
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
      <Card
        pad="none"
        className="flex flex-col gap-2 px-3 py-2.5 focus-within:border-gold/35"
      >
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
          className="max-h-[168px] min-h-[24px] w-full resize-none bg-transparent px-1.5 text-sm leading-relaxed text-bone placeholder:text-bone-faint"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant={browse ? "glass" : "ghost"}
            onClick={onToggleBrowse}
            aria-pressed={browse}
            title="Toggle live web browsing"
            className={browse ? "border-gold/45 text-gold" : undefined}
          >
            <Icon name="search" className="h-3.5 w-3.5" />
            {browse ? "Browsing on" : "Browse"}
          </Button>
          {/* Deliberately not a submit button. `IconButton` swaps a real
              `disabled` for `aria-disabled` whenever `render` is supplied, so
              rendering this as `type="submit"` would leave it clickable while
              it looks disabled. Enter is already handled on the textarea, so
              wiring the click directly loses nothing. */}
          <IconButton
            icon="send"
            label="Send to the Raven"
            variant="gold"
            size="md"
            disabled={!canSend}
            onClick={() => {
              if (!canSend) return;
              onSend();
              reset();
            }}
          />
        </div>
      </Card>
      <p className="mt-1.5 px-2 text-center text-[10px] text-bone-faint">
        The Raven can be wrong. Verify anything that moves coin.
      </p>
    </form>
  );
}
