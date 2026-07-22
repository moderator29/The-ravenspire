"use client";

import { useEffect } from "react";
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
 * Chat history as a full-page overlay (fixed inset-0). It covers the whole
 * screen, lists every saved conversation titled by its first message with a
 * relative timestamp, offers a New chat action and a per-item delete, and a
 * close control. Selecting a thread reloads it and closes the overlay. The
 * chat page underneath stays a normal in-shell page.
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
    <div className="fixed inset-0 z-50 flex flex-col bg-obsidian/97 backdrop-blur-xl">
      {/* Header spans the full width with the close control. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-steel-line/70 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/30 bg-panel-warm">
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close history"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-steel-line/70 text-bone-mut transition-colors hover:border-gold/35 hover:text-bone"
        >
          <Icon name="plus" className="h-4 w-4 rotate-45" />
        </button>
      </header>

      {/* Body: centered column so long lists stay readable on wide screens. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <button
            type="button"
            onClick={onNewChat}
            className="btn-gold mb-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm"
          >
            <Icon name="plus" className="h-4 w-4" />
            New chat
          </button>

          {conversations.length === 0 ? (
            <div className="px-2 py-16 text-center">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-gold/25 bg-panel-warm">
                <Icon name="scroll" className="h-6 w-6 text-gold" />
              </span>
              <p className="text-sm text-bone-mut">No conversations yet</p>
              <p className="mt-1 text-[11px] text-bone-faint">
                Your threads with the Raven will gather here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-xl border px-3.5 py-3 transition-colors ${
                        active
                          ? "border-gold/40 bg-panel-warm"
                          : "border-steel-line/50 bg-panel/40 hover:border-steel-line/80 hover:bg-panel/70"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
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
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        aria-label="Delete conversation"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bone-faint transition-colors hover:text-ember-deep focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Icon name="plus" className="h-4 w-4 rotate-45" />
                      </button>
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
