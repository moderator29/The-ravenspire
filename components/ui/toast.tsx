"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Toast as BaseToast } from "@base-ui/react/toast";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/button";

/* Toasts on Base UI Toast, plus the realm's only live region.

   Two separate things live in this file because they answer the same audit
   line. The product had zero `aria-live` regions despite a realtime feed, a
   realtime notification bell and realtime room state, so a screen reader user
   was never told that anything had arrived.

   Toast announcements are handled by Base UI itself: a toast added with the
   default `low` priority is announced politely from the title and description
   strings. Adding a second live region for the same content would double the
   announcement, so this file does not wrap toasts in one. What it does add is
   `useAnnounce`, a general polite channel for the events that are not toasts,
   for example "12 new ravens have arrived" appearing above the feed. */

export type ToastTone = "default" | "success" | "danger" | "info";

const TONE_ICON: Record<ToastTone, string | null> = {
  default: null,
  success: "check",
  danger: "alert",
  info: "info",
};

const TONE_ACCENT: Record<ToastTone, string> = {
  default: "text-bone-mut",
  /* Success is gold. Never green, here least of all: this is the surface a
     member sees at the moment something good happens. */
  success: "text-state-success",
  danger: "text-state-danger",
  info: "text-state-info",
};

type AnnounceContextValue = (message: string) => void;

const AnnounceContext = createContext<AnnounceContextValue | null>(null);

/* Push a sentence into the polite live region. Use for realtime arrivals that
   change the page without the member acting: new posts, a room going live, a
   balance settling. Keep it short, and never announce the same thing twice. */
export function useAnnounce(): AnnounceContextValue {
  const announce = useContext(AnnounceContext);
  return announce ?? noop;
}

function noop() {}

export function ToastProvider({
  children,
  limit = 4,
}: {
  children: ReactNode;
  limit?: number;
}) {
  const [message, setMessage] = useState("");
  const clearTimer = useRef<number | null>(null);

  const announce = useCallback((next: string) => {
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    /* Clearing first guarantees the region is seen to change even when the
       same sentence is announced twice in a row, which is otherwise a silent
       no-op in most screen readers. */
    setMessage("");
    clearTimer.current = window.setTimeout(() => setMessage(next), 60);
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      <BaseToast.Provider limit={limit}>
        {children}
        <BaseToast.Portal>
          <BaseToast.Viewport
            className={cx(
              "fixed bottom-4 left-1/2 z-toast w-[calc(100vw-2rem)] -translate-x-1/2",
              "sm:left-auto sm:right-6 sm:bottom-6 sm:w-[22rem] sm:translate-x-0"
            )}
          >
            <ToastList />
          </BaseToast.Viewport>
        </BaseToast.Portal>
        <div
          aria-live="polite"
          aria-atomic="true"
          role="status"
          className="sr-only"
        >
          {message}
        </div>
      </BaseToast.Provider>
    </AnnounceContext.Provider>
  );
}

function ToastList() {
  const { toasts } = BaseToast.useToastManager();

  return toasts.map((toast) => {
    const tone = (toast.type as ToastTone | undefined) ?? "default";
    const icon = TONE_ICON[tone] ?? null;

    return (
      <BaseToast.Root
        key={toast.id}
        toast={toast}
        className={cx(
          /* The stack: each toast behind the frontmost one peeks out by a
             fixed amount and scales down slightly, and the whole stack expands
             on hover or keyboard entry. The z rung comes off the token scale
             rather than an arbitrary number. */
          "absolute bottom-0 left-0 right-0 w-full origin-bottom",
          "[--peek:0.6rem] [--gap:0.6rem]",
          "[--scale:calc(max(0,1-(var(--toast-index)*0.05)))]",
          "[--shrink:calc(1-var(--scale))]",
          "[--height:var(--toast-frontmost-height,var(--toast-height))]",
          "[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
          "z-[calc(var(--z-toast)-var(--toast-index))]",
          "h-[var(--height)] data-expanded:h-[var(--toast-height)]",
          "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
          "data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
          "transition-[transform,opacity,height] duration-base ease-out-quint",
          "data-starting-style:[transform:translateY(120%)] data-starting-style:opacity-0",
          "data-ending-style:[transform:translateY(120%)] data-ending-style:opacity-0",
          "data-ending-style:duration-fast data-limited:opacity-0",
          /* A transparent apron under the toast so the pointer can travel
             between stacked toasts without the stack collapsing mid-move. */
          "after:absolute after:left-0 after:top-full after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
          "rounded-xl border border-gold/20 bg-panel/95 shadow-overlay backdrop-blur-[18px]"
        )}
      >
        <BaseToast.Content
          className={cx(
            "flex items-start gap-3 p-3.5",
            "transition-opacity duration-fast ease-out-quint",
            "data-behind:opacity-0 data-expanded:opacity-100"
          )}
        >
          {icon ? (
            <Icon
              name={icon}
              className={cx("mt-0.5 h-4 w-4 shrink-0", TONE_ACCENT[tone])}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <BaseToast.Title className="text-sm font-semibold text-bone" />
            <BaseToast.Description className="mt-0.5 text-xs leading-relaxed text-bone-mut" />
          </div>
          <BaseToast.Close
            render={<IconButton icon="close" label="Dismiss" size="sm" />}
          />
        </BaseToast.Content>
      </BaseToast.Root>
    );
  });
}

export interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  /* 0 keeps the toast up until it is dismissed. Use for anything the member
     must act on, never for a confirmation. */
  timeout?: number;
}

/* The calling surface.

     const toast = useToast();
     toast.success({ title: "Tribute sent" });

   `error` uses `high` priority, which Base UI announces assertively, because
   a failure the member did not expect is the one case that interrupts. */
export function useToast() {
  const manager = BaseToast.useToastManager();

  return useMemo(
    () => ({
      show: (options: ToastOptions & { tone?: ToastTone }) =>
        manager.add({
          title: options.title,
          description: options.description,
          timeout: options.timeout,
          type: options.tone ?? "default",
        }),
      success: (options: ToastOptions) =>
        manager.add({ ...options, type: "success" }),
      error: (options: ToastOptions) =>
        manager.add({ ...options, type: "danger", priority: "high" }),
      info: (options: ToastOptions) =>
        manager.add({ ...options, type: "info" }),
      close: (id?: string) => manager.close(id),
    }),
    [manager]
  );
}
