"use client";

import { useEffect } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { Conversation } from "@/components/raven/types";

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Chat history as a full page overlay. It lists every saved conversation titled
 * by its first message with a relative timestamp, offers a New chat action and
 * a per item delete. Selecting a thread reloads it and closes the overlay.
 *
 * Three things were wrong before and are fixed here. It rendered a full screen
 * overlay with no `role="dialog"` and no `aria-modal`, so a screen reader had
 * no way to know the page behind it was no longer reachable. Its close and
 * delete controls drew an X by rotating the `plus` glyph 45 degrees, when a
 * `close` glyph exists in the icon set. And the empty case was a hand written
 * centred sentence that reported an absence without offering a way out of it,
 * which is exactly what `EmptyState` exists to stop.
 */
export function HistoryPanel({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat history"
      className="fixed inset-0 z-50 flex flex-col bg-obsidian/97 backdrop-blur-xl"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-steel-line/70 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-[--radius-md] border border-gold/30 bg-panel-warm"
          >
            <Icon name="scroll" className="h-4 w-4 text-gold" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              Chat history
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              {conversations.length} saved
            </p>
          </div>
        </div>
        <IconButton
          icon="close"
          label="Close history"
          variant="glass"
          onClick={onClose}
        />
      </header>

      {/* Centred column so long lists stay readable on wide screens. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <Button
            variant="gold"
            size="lg"
            block
            onClick={onNewChat}
            className="mb-5"
          >
            <Icon name="plus" className="h-4 w-4" />
            New chat
          </Button>

          {conversations.length === 0 ? (
            <EmptyState
              icon="scroll"
              title="No conversations yet"
              body="Your threads with the Raven will gather here."
              action={
                <Button variant="glass" size="md" onClick={onNewChat}>
                  Ask the Raven something
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-[--radius-lg] border px-3.5 py-3 transition-colors duration-fast ${
                        active
                          ? "border-gold/40 bg-panel-warm"
                          : "border-steel-line/50 bg-panel/40 hover:border-steel-line/80 hover:bg-panel/70"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left"
                      >
                        <span
                          className={`w-full truncate text-sm ${
                            active ? "text-gold" : "text-bone"
                          }`}
                        >
                          {c.title || "Untitled"}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-bone-faint">
                          {relTime(c.updatedAt)}
                        </span>
                      </button>
                      {/* Revealed on hover at desktop, always present on touch,
                          where there is no hover to reveal it with. */}
                      <IconButton
                        icon="close"
                        label={`Delete ${c.title || "Untitled"}`}
                        size="sm"
                        onClick={() => onDelete(c.id)}
                        className="hover:text-state-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
