"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { StreamColumn } from "@/components/stream/stream-shell";

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

  const load = useCallback(async () => {
    const res = await realmFetch<{ notifications?: Notif[] }>(
      "/api/notifications"
    );
    const incoming = res.data?.notifications ?? [];
    /* Merge against the previous list inside the updater so the realtime
       handler never needs to re-subscribe on state changes. A known raven
       keeps whatever glow it already had; a newly seen one glows when it
       arrived unread. */
    setItems((prev) => {
      const priorFresh = new Map((prev ?? []).map((n) => [n.id, n.fresh]));
      return incoming.map((n) => ({
        ...n,
        fresh: priorFresh.has(n.id) ? priorFresh.get(n.id)! : !n.read,
      }));
    });
    /* Clear the server-side unread flag for the batch just shown. The glow is
       driven by `fresh`, so the page still highlights what was new this visit. */
    if (incoming.some((n) => !n.read)) {
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
    <StreamColumn className="px-3 py-4 sm:px-4 sm:py-6">
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
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            <span className="tnum">{unread}</span> new
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {!authenticated ? (
          /* The same shape the Bookmarks screen had: the only control a
             signed out member gets was an underlined word in a sentence. */
          <Card pad="none">
            <EmptyState
              icon3d="notifications"
              title="No ravens yet"
              body="Enter the realm and the ravens will find you."
              action={
                <Button variant="gold" size="lg" render={<Link href="/signin" />}>
                  Enter the realm
                </Button>
              }
            />
          </Card>
        ) : items === null ? (
          [0, 1, 2].map((i) => (
            <Card key={i} radius="lg" pad="none" className="h-16 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <Card pad="xl" className="text-center">
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
          </Card>
        ) : (
          items.map((n) => (
            <Card key={n.id} render={<Link href={notifHref(n)} />} radius="lg" pad="md" interactive className={`relative flex items-start gap-3 transition ${
                n.fresh
                  ?"border-gold/30 bg-gold/[0.04]"
                  : "opacity-80"
              }`}>
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
            </Card>
          ))
        )}
      </div>
    </StreamColumn>
  );
}
