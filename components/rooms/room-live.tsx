"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/tabs";
import { RoomAudio } from "@/components/rooms/room-audio";
import { useIsMobile } from "@/components/ui/sheet";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/social/types";

/* A court, as the Dossier archetype: hero band, then tabs, then panels.

   Below `lg` the two panels are exclusive and switched by a SegmentedControl,
   because a live chronicle and a roster stacked on a phone means the roster is
   a scroll away from the conversation and neither gets the screen. At `lg` and
   above the tab row disappears and both panels sit side by side, which is the
   responsive law: different layouts, not one layout scaled. */

type RoomStatus = "live" | "scheduled" | "ended";
type Panel = "floor" | "roster";

interface Person {
  id?: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface House {
  slug: string;
  name: string;
  sigil: string | null;
  color: string | null;
}

interface RosterEntry {
  profile_id: string;
  role: string;
  joined_at: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface RoomDetail {
  id: string;
  host_id: string;
  title: string | null;
  kind: string;
  status: RoomStatus;
  house_slug: string | null;
  started_at: string | null;
  ended_at: string | null;
  host: Person | null;
  house: House | null;
  participants: number;
  roster: RosterEntry[];
}

interface ChatMessage {
  id: string;
  profile_id: string;
  body: string | null;
  created_at: string;
  sender: Person | null;
  pending?: boolean;
}

interface FloatingReaction {
  id: string;
  reaction: string;
  handle: string | null;
  left: number;
}

const REACTIONS = ["heart", "flame", "crown", "swords", "medal", "shield"];

/* The floating reaction is the one deliberately slow motion on this surface,
   and it is ornament rather than interface, so it degrades to a plain fade
   when the member has asked for less motion. */
const RISE_KEYFRAMES = `
@keyframes rvsp-rise{
  0%{opacity:0;transform:translateY(6px) scale(.7)}
  12%{opacity:1}
  70%{opacity:1}
  100%{opacity:0;transform:translateY(-120px) scale(1.15)}
}
@media (prefers-reduced-motion: reduce){
  @keyframes rvsp-rise{
    0%{opacity:0}
    12%{opacity:1}
    70%{opacity:1}
    100%{opacity:0}
  }
}`;

function nameOf(p: Person | RosterEntry | null): string {
  if (!p) return "Unknown herald";
  return p.display_name ?? p.handle ?? "Unknown herald";
}

function letterOf(p: Person | RosterEntry | null): string {
  return nameOf(p).slice(0, 1).toUpperCase();
}

function byTime(a: ChatMessage, b: ChatMessage): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/* Avatars and status dots are the only circles the system allows. */
function Portrait({
  person,
  className,
}: {
  person: Person | RosterEntry | null;
  className: string;
}) {
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center overflow-hidden",
        "rounded-[var(--radius-full)] border border-steel-line bg-panel",
        "font-display text-gold",
        className
      )}
    >
      {person?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatar_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        letterOf(person)
      )}
    </span>
  );
}

export function RoomLive({ roomId }: { roomId: string }) {
  const { ready, authenticated } = useRealmAuth();
  const supabase = useMemo(() => createClient(), []);
  /* Dossier panels go two column at `lg`, one below, so the tab row is for
     everything narrower than that. */
  const stacked = useIsMobile("(max-width: 1023px)");

  const [me, setMe] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomDetail | null | "missing">(null);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("floor");

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms?id=${encodeURIComponent(roomId)}`);
      if (res.status === 404) {
        setRoom("missing");
        return;
      }
      const data = (await res.json()) as { room?: RoomDetail } | null;
      if (data?.room) setRoom(data.room);
    } catch {
      /* keep last known state */
    }
  }, [roomId]);

  const mergeMessage = useCallback((incoming: ChatMessage, mine: boolean) => {
    setMsgs((prev) => {
      const list = prev ?? [];
      if (list.some((m) => m.id === incoming.id)) return list;
      const pruned = mine
        ? list.filter(
            (m) => !(m.pending && (m.body ?? "") === (incoming.body ?? ""))
          )
        : list;
      return [...pruned, incoming].sort(byTime);
    });
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await realmFetch<{ me: string; messages: ChatMessage[] }>(
      `/api/rooms/messages?room=${encodeURIComponent(roomId)}`
    );
    if (res.ok && res.data) {
      if (res.data.me) setMe(res.data.me);
      setMsgs((prev) => {
        const pending = (prev ?? []).filter((m) => m.pending);
        const server = res.data!.messages;
        const ids = new Set(server.map((m) => m.id));
        const keep = pending.filter((m) => !ids.has(m.id));
        return [...server, ...keep].sort(byTime);
      });
    }
  }, [roomId]);

  /* Identify the caller once so we can tell host from guest. */
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

  /* Initial load. Messages only once a caller is known (they need auth). */
  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (!ready) return;
    if (authenticated) void loadMessages();
    /* Guests can watch the room but the chronicle read requires a citizen; show
       an empty floor rather than a perpetual skeleton. */
    else setMsgs((prev) => prev ?? []);
  }, [ready, authenticated, loadMessages]);

  /* One realtime channel per court carries chat, reactions, and roster
     changes. Broadcast by the server with the service role, so the anon
     client here only listens. */
  useEffect(() => {
    const channel = supabase
      .channel(`rooms:court:${roomId}`)
      .on("broadcast", { event: "message" }, (payload) => {
        const m = (payload.payload as { message?: ChatMessage } | undefined)
          ?.message;
        if (m) mergeMessage(m, m.profile_id === me);
      })
      .on("broadcast", { event: "reaction" }, (payload) => {
        const r = payload.payload as
          | { reaction?: string; handle?: string | null }
          | undefined;
        if (!r?.reaction || !REACTIONS.includes(r.reaction)) return;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const left = 8 + Math.random() * 78;
        setFloats((prev) => [
          ...prev.slice(-24),
          { id, reaction: r.reaction!, handle: r.handle ?? null, left },
        ]);
        window.setTimeout(() => {
          setFloats((prev) => prev.filter((f) => f.id !== id));
        }, 2600);
      })
      .on("broadcast", { event: "presence" }, () => {
        void loadRoom();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, me, mergeMessage, loadRoom]);

  /* Guaranteed fallbacks so the room stays true even if a broadcast is missed. */
  useEffect(() => {
    const t = setInterval(() => void loadRoom(), 10000);
    return () => clearInterval(t);
  }, [loadRoom]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const t = setInterval(() => void loadMessages(), 13000);
    return () => clearInterval(t);
  }, [ready, authenticated, loadMessages]);

  /* Pinned to the newest word, including when the chronicle remounts after a
     panel switch, which is why the active panel is a dependency here. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, panel, stacked]);

  const detail = room !== "missing" ? room : null;
  const isHost = detail !== null && me !== null && detail.host_id === me;
  const isMember =
    detail !== null &&
    me !== null &&
    detail.roster.some((r) => r.profile_id === me);
  const live = detail?.status === "live";
  const ended = detail?.status === "ended";
  const scheduled = detail?.status === "scheduled";

  const showSkeleton = useDelayedLoading(room === null, 300);

  async function act(action: "join" | "leave" | "close" | "start") {
    if (busy || !detail) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await realmFetch<{ error?: string }>("/api/rooms", {
      method: "POST",
      json: { action, room_id: detail.id },
    });
    if (!ok) setError(data?.error ?? "The act failed. Try again.");
    await loadRoom();
    setBusy(false);
  }

  async function react(reaction: string) {
    if (!detail || ended) return;
    setFloats((prev) => [
      ...prev.slice(-24),
      {
        id: `local-${Date.now()}`,
        reaction,
        handle: null,
        left: 8 + Math.random() * 78,
      },
    ]);
    await realmFetch("/api/rooms/messages", {
      method: "POST",
      json: { room: detail.id, reaction },
    });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending || !detail) return;
    setSending(true);
    setError(null);

    const optimistic: ChatMessage = {
      id: `temp-${crypto.randomUUID()}`,
      profile_id: me ?? "",
      body: text,
      created_at: new Date().toISOString(),
      sender: null,
      pending: true,
    };
    mergeMessage(optimistic, true);
    setBody("");

    const res = await realmFetch<{ ok: true; message: ChatMessage }>(
      "/api/rooms/messages",
      { method: "POST", json: { room: detail.id, body: text } }
    );
    if (res.ok && res.data?.message) {
      mergeMessage(res.data.message, true);
    } else {
      setMsgs((prev) =>
        prev ? prev.filter((m) => m.id !== optimistic.id) : prev
      );
      setBody(text);
      setError("The word was lost. Try again.");
    }
    setSending(false);
  }

  if (room === null) {
    /* Nothing at all under 300ms: a skeleton that appears and vanishes reads
       as the layout breaking, not as loading. */
    if (!showSkeleton) return null;
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
        <Card variant="warm" className="flex flex-col gap-3">
          <Skeleton radius="sm" className="h-4 w-20" />
          <Skeleton radius="md" className="h-7 w-3/5" />
          <div className="flex items-center gap-2">
            <Skeleton radius="full" className="h-8 w-8" />
            <Skeleton radius="sm" className="h-3 w-32" />
          </div>
        </Card>
        <Card pad="none" className="mt-3 h-[60vh] min-h-[22rem]">
          <div className="flex flex-col gap-3 p-4">
            <Skeleton radius="sm" className="h-9 w-3/5" />
            <Skeleton radius="sm" className="h-9 w-1/2" />
            <Skeleton radius="sm" className="h-9 w-2/3" />
          </div>
        </Card>
      </div>
    );
  }

  if (room === "missing" || !detail) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <EmptyState
          icon="signal"
          title="No such court"
          body="The dais you seek was never raised, or has long since emptied."
          action={
            <Button render={<Link href="/rookery" />}>
              Back to the Rookery
            </Button>
          }
        />
      </div>
    );
  }

  const canChat = live && authenticated && isMember;

  /* Every empty state carries a way out, and which way out depends on why the
     floor is empty. */
  const floorAction = !authenticated ? (
    <Button variant="gold" size="sm" render={<Link href="/signin" />}>
      Enter the realm
    </Button>
  ) : live && !isMember ? (
    <Button
      variant="gold"
      size="sm"
      loading={busy}
      onClick={() => void act("join")}
    >
      Join court
    </Button>
  ) : null;

  const chronicle = (
    <Card
      pad="none"
      className="relative flex h-[calc(100dvh-24rem)] min-h-[22rem] flex-col overflow-hidden lg:h-[calc(100dvh-22rem)]"
    >
      {/* Floating reactions layer */}
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {floats.map((f) => (
          <span
            key={f.id}
            className="absolute bottom-16"
            style={{
              left: `${f.left}%`,
              animation: "rvsp-rise 2.6s ease-out forwards",
            }}
          >
            <Icon name={f.reaction} className="h-6 w-6 text-gold" />
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-steel-line px-3.5 py-2.5">
        <p className="font-display text-sm font-semibold text-bone">
          The floor
        </p>
        <span className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
          Chronicle
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3.5 py-3"
        aria-live="polite"
      >
        {msgs === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Skeleton radius="full" className="h-7 w-7 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton radius="sm" className="h-3 w-24" />
                  <Skeleton
                    radius="sm"
                    className={i === 1 ? "h-3 w-1/2" : "h-3 w-3/5"}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : ended ? (
          <EmptyState
            size="sm"
            icon="scroll"
            title="This court has adjourned"
            body="The chronicle rests. The Rookery holds the courts still sitting."
            action={
              <Button size="sm" render={<Link href="/rookery" />}>
                To the Rookery
              </Button>
            }
          />
        ) : msgs.length === 0 ? (
          <EmptyState
            size="sm"
            icon="send"
            title={scheduled ? "The court is not yet raised" : "No words yet"}
            body={
              scheduled
                ? "Words will carry the moment the host goes live."
                : "Break the silence."
            }
            action={floorAction}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {msgs.map((m) => {
              const mine = me !== null && m.profile_id === me;
              return (
                <div key={m.id} className="flex items-start gap-2.5">
                  <Portrait
                    person={m.sender}
                    className="mt-0.5 h-7 w-7 text-[11px]"
                  />
                  <div
                    className={cx(
                      "min-w-0 flex-1",
                      m.pending && "opacity-70"
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-xs font-semibold text-bone">
                        {mine ? "You" : nameOf(m.sender)}
                      </span>
                      <span className="tnum shrink-0 text-[10px] text-bone-faint">
                        {m.pending ? "Sending" : timeAgo(m.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-bone-mut">
                      {m.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reaction rail */}
      {!ended && (
        <div className="flex items-center gap-1.5 border-t border-steel-line px-3 py-2">
          <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
            React
          </span>
          {REACTIONS.map((r) => (
            <IconButton
              key={r}
              icon={r}
              label={`React with ${r}`}
              size="lg"
              onClick={() => void react(r)}
              disabled={!authenticated}
              className="md:h-9 md:w-9"
            />
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => void send(e)}
        className="flex items-center gap-2 border-t border-steel-line px-3 py-2.5"
      >
        <Field className="min-w-0 flex-1">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!canChat}
            maxLength={500}
            aria-label="Take the floor"
            placeholder={
              !authenticated
                ? "Enter the realm to speak"
                : !live
                  ? "The court is not yet live"
                  : !isMember
                    ? "Join the court to speak"
                    : "Take the floor"
            }
            className="min-h-11 md:min-h-10"
          />
        </Field>
        <IconButton
          type="submit"
          icon="send"
          label="Send"
          variant="gold"
          size="lg"
          disabled={!canChat || sending || !body.trim()}
        />
      </form>
    </Card>
  );

  const roster = (
    <Card
      pad="none"
      className="flex max-h-[calc(100dvh-24rem)] min-h-[12rem] flex-col overflow-hidden lg:max-h-[calc(100dvh-22rem)]"
    >
      <div className="border-b border-steel-line px-3.5 py-2.5">
        <p className="font-display text-sm font-semibold text-bone">
          On the floor
        </p>
        <p className="text-[11px] text-bone-faint">
          <span className="tnum text-bone-mut">{detail.participants}</span>{" "}
          gathered
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {detail.roster.length === 0 ? (
          <EmptyState
            size="sm"
            icon="user"
            title="The benches are empty"
            body="Be the first to take a seat."
            action={floorAction}
          />
        ) : (
          <div className="flex flex-col gap-0.5">
            {detail.roster.map((p) => {
              const host = p.profile_id === detail.host_id;
              const inner = (
                <>
                  <Portrait person={p} className="h-8 w-8 text-[11px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-bone">
                      {nameOf(p)}
                    </span>
                    <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
                      {host
                        ? "Host"
                        : p.role === "speaker"
                          ? "Speaker"
                          : "Listener"}
                    </span>
                  </span>
                  {host && (
                    <Icon
                      name="crown"
                      className="h-3.5 w-3.5 shrink-0 text-gold"
                    />
                  )}
                </>
              );
              const rowClass =
                "flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 md:min-h-9";
              return p.handle ? (
                <Link
                  key={p.profile_id}
                  href={`/u/${p.handle}`}
                  className={cx(
                    rowClass,
                    "transition-colors duration-fast ease-out-quint hover:bg-panel"
                  )}
                >
                  {inner}
                </Link>
              ) : (
                <div key={p.profile_id} className={rowClass}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <style>{RISE_KEYFRAMES}</style>

      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        render={<Link href="/rookery" />}
      >
        <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
        The Rookery
      </Button>

      {/* Hero band. The one place in a Dossier that may carry warmth. */}
      <Card variant="warm" pad="lg" className="mt-3 overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {live ? (
              <Badge variant="beta" icon="signal">
                Live now
              </Badge>
            ) : ended ? (
              <Badge>Adjourned</Badge>
            ) : (
              <Badge variant="gold">Upcoming</Badge>
            )}
            <h1 className="mt-2.5 break-words font-display text-2xl font-semibold text-bone">
              {detail.title ?? "An unnamed court"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <Portrait person={detail.host} className="h-8 w-8 text-xs" />
                <span className="text-xs text-bone-mut">
                  Held by{" "}
                  {detail.host?.handle ? (
                    <Link
                      href={`/u/${detail.host.handle}`}
                      className="font-semibold text-bone hover:text-gold"
                    >
                      {nameOf(detail.host)}
                    </Link>
                  ) : (
                    <span className="font-semibold text-bone">
                      {nameOf(detail.host)}
                    </span>
                  )}
                </span>
              </div>
              {detail.house && (
                <span className="inline-flex items-center gap-1.5 text-xs text-bone-mut">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-[var(--radius-full)]"
                    style={{ backgroundColor: detail.house.color ?? "#D9B040" }}
                  />
                  {detail.house.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs text-bone-mut">
                <Icon name="user" className="h-3.5 w-3.5 text-bone-faint" />
                <span className="tnum text-bone">{detail.participants}</span>{" "}
                {detail.participants === 1 ? "soul" : "souls"} gathered
              </span>
            </div>
          </div>

          {/* 44px on touch, dense above md, per the density table. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end [&_button]:min-h-11 [&_a]:min-h-11 md:[&_button]:min-h-9 md:[&_a]:min-h-9">
            {ready && authenticated && (
              <>
                {isHost ? (
                  <>
                    {scheduled && (
                      <Button
                        variant="gold"
                        loading={busy}
                        onClick={() => void act("start")}
                      >
                        <Icon name="signal" className="h-4 w-4" />
                        Go live
                      </Button>
                    )}
                    {!ended && (
                      <Button
                        loading={busy}
                        onClick={() => void act("close")}
                      >
                        End court
                      </Button>
                    )}
                  </>
                ) : ended ? null : isMember ? (
                  <Button loading={busy} onClick={() => void act("leave")}>
                    Leave
                  </Button>
                ) : (
                  <Button
                    variant="gold"
                    loading={busy}
                    disabled={!live}
                    onClick={() => void act("join")}
                  >
                    <Icon name="signal" className="h-4 w-4" />
                    Join court
                  </Button>
                )}
              </>
            )}
            {ready && !authenticated && (
              <Button variant="gold" render={<Link href="/signin" />}>
                Enter the realm
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* The stage sits with the court it belongs to, under the hero and above
          the panels, which is the order the Dossier archetype fixes. An ended
          court has no stage to enter. */}
      {!ended && (
        <div className="mt-3">
          <RoomAudio roomId={detail.id} />
        </div>
      )}

      {error && (
        <Card
          variant="inset"
          pad="sm"
          role="alert"
          className="mt-3 flex items-start gap-2.5 border-state-danger/45"
        >
          <Icon
            name="alert"
            className="mt-0.5 h-4 w-4 shrink-0 text-state-danger"
          />
          <p className="text-sm text-state-danger">{error}</p>
        </Card>
      )}

      {stacked ? (
        <div className="mt-3 flex flex-col gap-3">
          <SegmentedControl
            block
            label="Court panels"
            value={panel}
            onValueChange={(next) => setPanel(next as Panel)}
            items={[
              { value: "floor", label: "The floor" },
              { value: "roster", label: "On the floor" },
            ]}
          />
          {panel === "floor" ? chronicle : roster}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          {chronicle}
          {roster}
        </div>
      )}
    </div>
  );
}
