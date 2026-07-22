"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import {
  NOTIF_KIND_ICON,
  NOTIF_KIND_TEXT,
  notifActorName,
  notifHref,
  type NotifActor,
} from "@/lib/notification-view";

interface LatestNotif {
  id: string;
  kind: string;
  body: string | null;
  created_at: string;
  subject_id: string | null;
  actor: NotifActor | null;
}

interface UnreadResponse {
  count?: number;
  latest?: LatestNotif | null;
}

interface Toast {
  key: string;
  kind: string;
  body: string | null;
  href: string;
  actor: NotifActor | null;
}

interface NotificationsContextValue {
  /* Unread raven count for the bell badge. */
  unread: number;
  /* Force a refresh (used after the member clears the center). */
  refresh: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unread: 0,
  refresh: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

const TOAST_TTL_MS = 6000;

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, authenticated } = useRealmAuth();
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();

  const [me, setMe] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  /* Refs so the realtime handler and pollers read live values without forcing
     a re-subscribe on every state change. */
  const seededRef = useRef(false);
  const lastToastedRef = useRef<string | null>(null);
  const onRavensRef = useRef(false);

  // Keep the ref in sync outside render so the realtime handler can read the
  // live route without accessing a ref during render.
  useEffect(() => {
    onRavensRef.current = pathname === "/ravens";
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismissToast = useCallback((key: string) => {
    setToasts((list) => list.filter((t) => t.key !== key));
  }, []);

  const pushToast = useCallback(
    (n: LatestNotif) => {
      const toast: Toast = {
        key: n.id,
        kind: n.kind,
        body: n.body,
        href: notifHref(n),
        actor: n.actor,
      };
      setToasts((list) =>
        list.some((t) => t.key === toast.key)
          ? list
          : [...list, toast].slice(-3)
      );
      window.setTimeout(() => dismissToast(toast.key), TOAST_TTL_MS);
    },
    [dismissToast]
  );

  const load = useCallback(async () => {
    const res = await realmFetch<UnreadResponse>("/api/notifications/unread");
    if (!res.ok) return;
    const count = res.data?.count ?? 0;
    const latest = res.data?.latest ?? null;
    setUnread(count);

    if (!seededRef.current) {
      /* First read of the session: adopt the current head without toasting the
         backlog the member has not seen yet. */
      seededRef.current = true;
      lastToastedRef.current = latest?.id ?? null;
      return;
    }
    if (
      latest &&
      latest.id !== lastToastedRef.current &&
      !onRavensRef.current
    ) {
      pushToast(latest);
    }
    if (latest) lastToastedRef.current = latest.id;
  }, [pushToast]);

  /* Resolve the caller's profile id to open their private raven channel. */
  useEffect(() => {
    if (!ready || !authenticated) {
      setMe(null);
      setUnread(0);
      seededRef.current = false;
      lastToastedRef.current = null;
      return;
    }
    void realmFetch<{ profile?: { id: string } }>("/api/me", {
      method: "POST",
    }).then(({ data }) => {
      if (data?.profile?.id) setMe(data.profile.id);
    });
  }, [ready, authenticated]);

  /* Live ravens: the server broadcasts to notifs:user:{id} on every filing.
     Refresh on the nudge, with a slow poll so nothing is silently missed. */
  useEffect(() => {
    if (!me) return;
    void load();
    const channel = supabase
      .channel(`notifs:user:${me}`)
      .on("broadcast", { event: "notification" }, () => {
        void load();
      })
      .subscribe();
    const poll = window.setInterval(() => void load(), 30000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [supabase, me, load]);

  /* The center marks everything read on view, so reflect a cleared badge the
     moment the member lands there, and re-read the true count elsewhere. */
  useEffect(() => {
    if (!me) return;
    if (pathname === "/ravens") {
      setUnread(0);
    } else {
      void load();
    }
  }, [pathname, me, load]);

  const value = useMemo(
    () => ({ unread, refresh: () => void load() }),
    [unread, load]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {mounted &&
        toasts.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end">
            {toasts.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                onClick={() => dismissToast(t.key)}
                className="notif-toast glass glass-warm pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3.5 shadow-2xl transition hover:border-gold/40"
              >
                <span className="relative shrink-0">
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel font-display text-sm text-gold">
                    {t.actor?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.actor.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      notifActorName(t.actor).slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-steel-line bg-obsidian text-gold">
                    <Icon
                      name={NOTIF_KIND_ICON[t.kind] ?? "bell"}
                      className="h-3 w-3"
                    />
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-bone">
                    <span className="font-semibold">
                      {notifActorName(t.actor)}
                    </span>{" "}
                    <span className="text-bone-mut">
                      {NOTIF_KIND_TEXT[t.kind] ?? t.kind}
                    </span>
                  </p>
                  {t.body && (
                    <p className="mt-0.5 truncate text-xs text-bone-faint">
                      {t.body}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dismissToast(t.key);
                  }}
                  className="shrink-0 text-bone-faint transition hover:text-bone"
                >
                  <Icon name="plus" className="h-4 w-4 rotate-45" />
                </button>
              </Link>
            ))}
          </div>,
          document.body
        )}
    </NotificationsContext.Provider>
  );
}
