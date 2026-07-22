"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/social/types";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import {
  NOTIF_KIND_ICON,
  NOTIF_KIND_TEXT,
  notifActorName,
  notifHref,
  type NotifActor,
} from "@/lib/notification-view";

interface Notif {
  id: string;
  kind: string;
  body: string | null;
  read: boolean;
  created_at: string;
  subject_id: string | null;
  actor: NotifActor | null;
}

/* Client-side view model: `fresh` remembers a raven arrived unread this visit,
   so it keeps its glow even after the server marks the batch read. */
interface NotifView extends Notif {
  fresh: boolean;
}

export default function RavensPage() {
  const { ready, authenticated } = useRealmAuth();
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<string | null>(null);
  const [items, setItems] = useState<NotifView[] | null>(null);

  /* Keep the latest list in a ref so the realtime handler and the mark-read
     call can read it without re-subscribing on every state change. */
  const itemsRef = useRef<NotifView[] | null>(null);
  itemsRef.current = items;

  const load = useCallback(async () => {
    const res = await realmFetch<{ notifications?: Notif[] }>(
      "/api/notifications"
    );
    const incoming = res.data?.notifications ?? [];
    const priorFresh = new Map(
      (itemsRef.current ?? []).map((n) => [n.id, n.fresh])
    );
    const merged: NotifView[] = incoming.map((n) => ({
      ...n,
      /* A known raven keeps whatever glow it already had; a newly seen one
         glows when it arrived unread. */
      fresh: priorFresh.has(n.id) ? priorFresh.get(n.id)! : !n.read,
    }));
    setItems(merged);
    /* Clear the server-side unread flag for the batch just shown. The glow is
       driven by `fresh`, so the page still highlights what was new this visit. */
    if (merged.some((n) => !n.read)) {
      await realmFetch("/api/notifications", { method: "POST" });
    }
  }, []);

  /* Learn who the caller is so we can open their private raven channel. */
  useEffect(() => {
    if (!ready || !authenticated) {
      setMe(null);
      return;
    }
    void realmFetch<{ profile?: { id: string } }>("/api/me", {
      method: "POST",
    }).then(({ data }) => {
      if (data?.profile?.id) setMe(data.profile.id);
    });
  }, [ready, authenticated]);

  /* Initial load. */
  useEffect(() => {
    if (!ready || !authenticated) return;
    void load();
  }, [ready, authenticated, load]);

  /* Live ravens: the server broadcasts to notifs:user:{id} whenever a
     notification is filed for this member. We refresh on the nudge and fall
     back to a slow poll so nothing is ever silently missed. */
  useEffect(() => {
    if (!me) return;
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

  const unread = (items ?? []).filter((n) => n.fresh).length;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4">
        <BackButton />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-bone">Ravens</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
            Notifications
          </p>
        </div>
        {unread > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            <span className="tnum">{unread}</span> new
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {!authenticated ? (
          <div className="glass p-8 text-center text-sm text-bone-mut">
            <Link href="/signin" className="text-gold underline">
              Enter the realm
            </Link>{" "}
            and the ravens will find you.
          </div>
        ) : items === null ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="glass glass-sm h-16 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="glass p-10 text-center">
            <Icon
              name="raven"
              className="mx-auto h-8 w-8 text-bone-faint"
            />
            <p className="mt-3 text-sm text-bone-mut">
              No ravens have arrived for you yet.
            </p>
            <p className="mt-1 text-xs text-bone-faint">
              Post, follow, and duel, and the realm will answer.
            </p>
          </div>
        ) : (
          items.map((n) => (
            <Link
              key={n.id}
              href={notifHref(n)}
              className={`glass glass-sm glass-hover relative flex items-start gap-3 p-3.5 transition ${
                n.fresh
                  ? "border-gold/30 bg-gold/[0.04]"
                  : "opacity-80"
              }`}
            >
              {n.fresh && (
                <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-gold" />
              )}

              {/* Actor face, with a kind badge riding its corner. */}
              <span className="relative shrink-0">
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel font-display text-sm text-gold">
                  {n.actor?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.actor.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    notifActorName(n.actor).slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-steel-line bg-obsidian text-gold">
                  <Icon
                    name={NOTIF_KIND_ICON[n.kind] ?? "bell"}
                    className="h-3 w-3"
                  />
                </span>
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm text-bone">
                  <span className="font-semibold">
                    {notifActorName(n.actor)}
                  </span>{" "}
                  <span className="text-bone-mut">
                    {NOTIF_KIND_TEXT[n.kind] ?? n.kind}
                  </span>
                </p>
                {n.body && (
                  <p className="mt-0.5 truncate text-xs text-bone-faint">
                    {n.body}
                  </p>
                )}
              </div>

              <span className="tnum shrink-0 pt-0.5 text-[11px] text-bone-faint">
                {timeAgo(n.created_at)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
