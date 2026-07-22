"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { timeAgo } from "@/lib/social/types";

type RoomStatus = "live" | "scheduled" | "ended";

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

export function RoomLive({ roomId }: { roomId: string }) {
  const { ready, authenticated } = useRealmAuth();
  const supabase = useMemo(() => createClient(), []);

  const [me, setMe] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomDetail | null | "missing">(null);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const detail = room !== "missing" ? room : null;
  const isHost = detail !== null && me !== null && detail.host_id === me;
  const isMember =
    detail !== null &&
    me !== null &&
    detail.roster.some((r) => r.profile_id === me);
  const live = detail?.status === "live";
  const ended = detail?.status === "ended";
  const scheduled = detail?.status === "scheduled";

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
      setMsgs((prev) => (prev ? prev.filter((m) => m.id !== optimistic.id) : prev));
      setBody(text);
      setError("The word was lost. Try again.");
    }
    setSending(false);
  }

  if (room === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-4">
        <div className="glass h-24 animate-pulse" />
        <div className="glass mt-3 h-[60vh] animate-pulse" />
      </div>
    );
  }

  if (room === "missing" || !detail) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Icon name="signal" className="mx-auto h-8 w-8 text-bone-faint" />
        <h1 className="mt-4 font-display text-xl font-semibold text-bone">
          No such court
        </h1>
        <p className="mt-2 text-sm text-bone-mut">
          The dais you seek was never raised, or has long since emptied.
        </p>
        <Link href="/rookery" className="btn-glass mt-6 inline-flex px-5 py-2.5 text-sm">
          Back to the Rookery
        </Link>
      </div>
    );
  }

  const canChat = live && authenticated && isMember;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
      <style>{`@keyframes rvsp-rise{0%{opacity:0;transform:translateY(6px) scale(.7)}12%{opacity:1}70%{opacity:1}100%{opacity:0;transform:translateY(-120px) scale(1.15)}}`}</style>

      <Link
        href="/rookery"
        className="inline-flex items-center gap-1.5 text-xs text-bone-faint transition hover:text-gold"
      >
        <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
        The Rookery
      </Link>

      {/* Dais header */}
      <div className="glass gold-metal relative mt-3 overflow-hidden p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ember/40 bg-ember/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
                Live now
              </span>
            ) : ended ? (
              <span className="inline-flex items-center rounded-full border border-steel-line bg-panel px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-mut">
                Adjourned
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                Upcoming
              </span>
            )}
            <h1 className="mt-2.5 break-words font-display text-2xl font-semibold text-bone">
              {detail.title ?? "An unnamed court"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel font-display text-xs text-gold">
                  {detail.host?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detail.host.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    letterOf(detail.host)
                  )}
                </span>
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
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: detail.house.color ?? "#C8A24C" }}
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

          <div className="flex shrink-0 flex-col items-end gap-2">
            {ready && authenticated && (
              <>
                {isHost ? (
                  <>
                    {scheduled && (
                      <button
                        onClick={() => void act("start")}
                        disabled={busy}
                        className="btn-gold px-4 py-2 text-sm disabled:opacity-50"
                      >
                        <Icon name="signal" className="h-4 w-4" />
                        Go live
                      </button>
                    )}
                    {!ended && (
                      <button
                        onClick={() => void act("close")}
                        disabled={busy}
                        className="btn-glass px-4 py-2 text-sm disabled:opacity-50"
                      >
                        End court
                      </button>
                    )}
                  </>
                ) : ended ? null : isMember ? (
                  <button
                    onClick={() => void act("leave")}
                    disabled={busy}
                    className="btn-glass px-4 py-2 text-sm disabled:opacity-50"
                  >
                    Leave
                  </button>
                ) : (
                  <button
                    onClick={() => void act("join")}
                    disabled={busy || !live}
                    className="btn-gold px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <Icon name="signal" className="h-4 w-4" />
                    Join court
                  </button>
                )}
              </>
            )}
            {ready && !authenticated && (
              <Link href="/signin" className="btn-gold px-4 py-2 text-sm">
                Enter the realm
              </Link>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="glass glass-sm mt-3 border-ember/40 p-3 text-sm text-ember">
          {error}
        </div>
      )}

      {/* Audio placeholder: clearly a promise, never a dead button. */}
      <div className="glass glass-sm mt-3 flex items-center gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-steel-line bg-panel">
          <Icon name="signal" className="h-4 w-4 text-bone-faint" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-bone">The speaking stones</p>
          <p className="text-xs text-bone-mut">
            Live voice arrives when the court&apos;s audio provider is set. For
            now the floor speaks in the chronicle below.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-steel-line bg-panel px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
          Coming
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
        {/* Chronicle (chat) with floating reactions */}
        <div className="glass relative flex h-[calc(100dvh-22rem)] min-h-[22rem] flex-col overflow-hidden">
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

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3">
            {msgs === null ? (
              <div className="flex flex-col gap-2">
                <div className="glass-sm glass h-9 w-3/5 animate-pulse" />
                <div className="glass-sm glass h-9 w-1/2 animate-pulse" />
              </div>
            ) : ended ? (
              <p className="py-10 text-center text-sm text-bone-mut">
                This court has adjourned. The chronicle rests.
              </p>
            ) : msgs.length === 0 ? (
              <p className="py-10 text-center text-sm text-bone-mut">
                {scheduled
                  ? "The court has not yet been raised. Words will carry once it goes live."
                  : "No words yet. Break the silence."}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {msgs.map((m) => {
                  const mine = me !== null && m.profile_id === me;
                  return (
                    <div key={m.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel font-display text-[11px] text-gold">
                        {m.sender?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.sender.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          nameOf(m.sender).slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <div className={`min-w-0 flex-1 ${m.pending ? "opacity-70" : ""}`}>
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
                <button
                  key={r}
                  type="button"
                  onClick={() => void react(r)}
                  disabled={!authenticated}
                  aria-label={`React with ${r}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-steel-line bg-panel text-bone-mut transition hover:text-gold disabled:opacity-40"
                >
                  <Icon name={r} className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => void send(e)}
            className="flex items-center gap-2 border-t border-steel-line px-3 py-2.5"
          >
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!canChat}
              maxLength={500}
              placeholder={
                !authenticated
                  ? "Enter the realm to speak"
                  : !live
                  ? "The court is not yet live"
                  : !isMember
                  ? "Join the court to speak"
                  : "Take the floor"
              }
              className="w-full rounded-xl border border-steel-line bg-panel px-3.5 py-2.5 text-sm text-bone placeholder:text-bone-faint focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canChat || sending || !body.trim()}
              aria-label="Send"
              className="btn-gold flex h-10 w-10 shrink-0 items-center justify-center disabled:opacity-50"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Roster */}
        <div className="glass flex max-h-[calc(100dvh-22rem)] min-h-[12rem] flex-col overflow-hidden">
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
              <p className="px-2 py-6 text-center text-xs text-bone-mut">
                The benches are empty. Be the first to take a seat.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {detail.roster.map((p) => {
                  const host = p.profile_id === detail.host_id;
                  const inner = (
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-steel-line bg-panel font-display text-[11px] text-gold">
                        {p.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          letterOf(p)
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-bone">
                          {nameOf(p)}
                        </span>
                        <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
                          {host ? "Host" : p.role === "speaker" ? "Speaker" : "Listener"}
                        </span>
                      </span>
                      {host && (
                        <Icon name="crown" className="h-3.5 w-3.5 shrink-0 text-gold" />
                      )}
                    </>
                  );
                  return p.handle ? (
                    <Link
                      key={p.profile_id}
                      href={`/u/${p.handle}`}
                      className="glass-hover flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      key={p.profile_id}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
