"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { timeAgo } from "@/lib/social/types";

interface ConvoOther {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Convo {
  id: string;
  kind: string;
  title: string | null;
  last_message_at: string | null;
  other: ConvoOther | null;
  unread: number;
}

interface Message {
  id: string;
  sender_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  /* Local-only: an optimistic message not yet confirmed by the server. */
  pending?: boolean;
}

interface ProfileHit {
  id: string;
  handle: string | null;
  display_name: string | null;
}

function convoName(c: Convo): string {
  return c.other?.display_name ?? c.other?.handle ?? c.title ?? "Whisper";
}

function avatarLetter(c: Convo): string {
  return convoName(c).slice(0, 1).toUpperCase();
}

/* The recipient's portrait: their real avatar when they have one, otherwise
   the initial on the house-panel disc used everywhere else in the corridor. */
function OtherAvatar({
  other,
  className,
}: {
  other: ConvoOther | null;
  className: string;
}) {
  const letter = (other?.display_name ?? other?.handle ?? "?")
    .slice(0, 1)
    .toUpperCase();
  if (other?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={other.avatar_url}
        alt=""
        className={`shrink-0 rounded-full border border-steel-line object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border border-steel-line bg-panel font-display text-gold ${className}`}
    >
      {letter}
    </span>
  );
}

function byTime(a: Message, b: Message): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

export default function WhispersPage() {
  const { ready, authenticated } = useRealmAuth();
  const supabase = useMemo(() => createClient(), []);

  const [convos, setConvos] = useState<Convo[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  /* Image staged in the composer, uploaded and ready to send. */
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProfileHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [composeErr, setComposeErr] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadConvos = useCallback(async () => {
    const res = await realmFetch<{ me: string; conversations: Convo[] }>(
      "/api/whispers"
    );
    if (res.ok && res.data) {
      if (res.data.me) setMeId(res.data.me);
      setConvos(res.data.conversations);
    } else setConvos((prev) => prev ?? []);
  }, []);

  /* Merge a message in, deduping by id and clearing the optimistic twin so a
     confirmed send and its realtime echo never double up. */
  const mergeMessage = useCallback((incoming: Message, mine: boolean) => {
    setMsgs((prev) => {
      const list = prev ?? [];
      if (list.some((m) => m.id === incoming.id)) return list;
      const pruned = mine
        ? list.filter(
            (m) =>
              !(
                m.pending &&
                (m.body ?? "") === (incoming.body ?? "") &&
                (m.image_url ?? "") === (incoming.image_url ?? "")
              )
          )
        : list;
      return [...pruned, incoming].sort(byTime);
    });
  }, []);

  const loadMessages = useCallback(async (conversation: string) => {
    const res = await realmFetch<{ me: string; messages: Message[] }>(
      `/api/whispers/messages?conversation=${encodeURIComponent(conversation)}`
    );
    if (res.ok && res.data) {
      setMeId(res.data.me);
      setMsgs((prev) => {
        /* Preserve any still-unconfirmed optimistic messages on refresh. */
        const pending = (prev ?? []).filter((m) => m.pending);
        const server = res.data!.messages;
        const serverIds = new Set(server.map((m) => m.id));
        const keep = pending.filter((m) => !serverIds.has(m.id));
        return [...server, ...keep].sort(byTime);
      });
    }
  }, []);

  /* Initial conversation list */
  useEffect(() => {
    if (ready && authenticated) void loadConvos();
  }, [ready, authenticated, loadConvos]);

  /* Personal realtime channel: reorder the corridor and refresh unread the
     instant any of my conversations receives a whisper. */
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`whispers:user:${meId}`)
      .on("broadcast", { event: "bump" }, () => {
        void loadConvos();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, meId, loadConvos]);

  /* Thread realtime channel: append incoming whispers live. Keyed on the
     secret conversation id, so only the two participants ever hold the topic. */
  useEffect(() => {
    if (!activeId) return;
    const channel = supabase
      .channel(`whispers:conv:${activeId}`)
      .on("broadcast", { event: "message" }, (payload) => {
        const m = (payload.payload as { message?: Message } | undefined)
          ?.message;
        if (!m || activeIdRef.current !== activeId) return;
        mergeMessage(m, m.sender_id === meId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, activeId, meId, mergeMessage]);

  /* Gentle poll as a fallback so delivery is guaranteed even if a broadcast
     is missed (open thread, and the corridor for unread counts). */
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => void loadMessages(activeId), 12000);
    return () => clearInterval(t);
  }, [activeId, loadMessages]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const t = setInterval(() => void loadConvos(), 25000);
    return () => clearInterval(t);
  }, [ready, authenticated, loadConvos]);

  /* Keep the thread pinned to the latest message */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, activeId]);

  /* Profile search for a new whisper */
  useEffect(() => {
    const q = query.trim().replace(/[%_]/g, "");
    if (q.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void supabase
        .from("profiles")
        .select("id, handle, display_name")
        .ilike("handle", `%${q}%`)
        .not("handle", "is", null)
        .not("is_agent", "is", true)
        .limit(8)
        .then(({ data }) => {
          setHits((data as ProfileHit[]) ?? []);
          setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [supabase, query]);

  function openThread(id: string) {
    setActiveId(id);
    setMsgs(null);
    setBody("");
    setPendingImage(null);
    setSendErr(null);
    setConvos((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)) : prev
    );
    void loadMessages(id);
  }

  function closeThread() {
    setActiveId(null);
    setMsgs(null);
    setBody("");
    setPendingImage(null);
    setSendErr(null);
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSendErr(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await realmFetch<{ url?: string; error?: string }>(
      "/api/upload",
      { method: "POST", body: form }
    );
    if (res.ok && res.data?.url) setPendingImage(res.data.url);
    else setSendErr(res.data?.error ?? "That image could not be sent.");
    setUploading(false);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    const image = pendingImage;
    if ((!text && !image) || !activeId || sending || uploading) return;
    setSending(true);
    setSendErr(null);

    const optimistic: Message = {
      id: `temp-${crypto.randomUUID()}`,
      sender_id: meId ?? "",
      body: text || null,
      image_url: image,
      created_at: new Date().toISOString(),
      pending: true,
    };
    mergeMessage(optimistic, true);
    setBody("");
    setPendingImage(null);

    const res = await realmFetch<{ ok: true; message: Message }>(
      "/api/whispers/messages",
      {
        method: "POST",
        json: {
          conversation: activeId,
          body: text || undefined,
          imageUrl: image || undefined,
        },
      }
    );
    if (res.ok && res.data?.message) {
      mergeMessage(res.data.message, true);
      void loadConvos();
    } else {
      /* Roll the optimistic message back and restore the draft. */
      setMsgs((prev) =>
        prev ? prev.filter((m) => m.id !== optimistic.id) : prev
      );
      if (text) setBody(text);
      if (image) setPendingImage(image);
      setSendErr("The whisper was lost. Try again.");
    }
    setSending(false);
  }

  async function startWhisper(p: ProfileHit) {
    if (starting) return;
    setStarting(p.id);
    setComposeErr(null);
    const res = await realmFetch<{ id: string }>("/api/whispers", {
      method: "POST",
      json: { with: p.id },
    });
    if (res.ok && res.data?.id) {
      setComposeOpen(false);
      setQuery("");
      setHits(null);
      await loadConvos();
      openThread(res.data.id);
    } else {
      setComposeErr("That whisper could not be opened. Try again.");
    }
    setStarting(null);
  }

  const active = convos?.find((c) => c.id === activeId) ?? null;
  const canSend = (body.trim().length > 0 || Boolean(pendingImage)) && !uploading;

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      <div className={activeId ? "hidden md:block" : ""}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-bone">
              Whispers
            </h1>
            <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
              Messages
            </p>
          </div>
          {ready && authenticated && (
            <button
              type="button"
              onClick={() => {
                setComposeOpen((v) => !v);
                setComposeErr(null);
              }}
              className="btn-glass flex items-center gap-2 px-3.5 py-2 text-sm"
            >
              <Icon name="plus" className="h-4 w-4" />
              New whisper
            </button>
          )}
        </div>
      </div>

      {!ready ? (
        <div className="glass mt-5 h-48 animate-pulse" />
      ) : !authenticated ? (
        <div className="glass mt-5 p-8 text-center">
          <Icon name="mail" className="mx-auto h-7 w-7 text-gold" />
          <p className="mt-3 text-sm text-bone-mut">
            Whispers travel only between citizens of the realm.
          </p>
          <Link href="/signin" className="btn-gold mt-5 px-5 py-2.5 text-sm">
            Enter the realm
          </Link>
        </div>
      ) : (
        <>
          {/* New whisper search */}
          {composeOpen && !activeId && (
            <div className="glass mt-4 p-3">
              <div className="flex items-center gap-3 rounded-xl border border-steel-line bg-panel px-3.5 py-2.5">
                <Icon
                  name="search"
                  className="h-4 w-4 shrink-0 text-bone-faint"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search citizens by handle"
                  className="w-full bg-transparent text-sm text-bone placeholder:text-bone-faint focus:outline-none"
                />
              </div>
              {composeErr && (
                <p className="mt-2 text-xs text-ember">{composeErr}</p>
              )}
              <div className="mt-2 flex flex-col gap-1.5">
                {searching && hits === null ? (
                  [0, 1].map((i) => (
                    <div
                      key={i}
                      className="glass-sm glass h-12 animate-pulse"
                    />
                  ))
                ) : hits && hits.length === 0 ? (
                  <p className="px-1 py-3 text-center text-sm text-bone-mut">
                    No citizen answers to that handle.
                  </p>
                ) : (
                  (hits ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={starting !== null}
                      onClick={() => void startWhisper(p)}
                      className="glass glass-sm glass-hover flex w-full items-center gap-3 p-2.5 text-left disabled:opacity-60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-steel-line bg-panel font-display text-sm text-gold">
                        {(p.display_name ?? p.handle ?? "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-bone">
                          {p.display_name ?? p.handle}
                        </span>
                        <span className="block truncate text-xs text-bone-faint">
                          @{p.handle}
                        </span>
                      </span>
                      {starting === p.id ? (
                        <span className="shrink-0 text-xs text-bone-faint">
                          Opening
                        </span>
                      ) : (
                        <Icon
                          name="send"
                          className="h-4 w-4 shrink-0 text-gold"
                        />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mt-4 md:grid md:grid-cols-[300px_minmax(0,1fr)] md:items-start md:gap-4">
            {/* Conversation list */}
            <div
              className={`${
                activeId ? "hidden md:flex" : "flex"
              } flex-col gap-2`}
            >
              {convos === null ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className="glass glass-sm h-16 animate-pulse" />
                ))
              ) : convos.length === 0 ? (
                <div className="glass p-8 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-steel-line bg-panel">
                    <Icon name="send" className="h-5 w-5 text-gold" />
                  </span>
                  <p className="mt-3 text-sm text-bone-mut">
                    No whispers yet. Find a Keep at the Crossroads and speak.
                  </p>
                  <Link
                    href="/explore"
                    className="btn-glass mt-4 inline-flex px-4 py-2 text-sm"
                  >
                    To the Crossroads
                  </Link>
                </div>
              ) : (
                convos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openThread(c.id)}
                    className={`${
                      c.id === activeId ? "glass glass-warm" : "glass glass-sm"
                    } glass-hover flex w-full items-center gap-3 p-3 text-left`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-steel-line bg-panel font-display text-sm text-gold">
                      {avatarLetter(c)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-bone">
                        {convoName(c)}
                      </span>
                      {c.other?.handle && (
                        <span className="block truncate text-xs text-bone-faint">
                          @{c.other.handle}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      {c.last_message_at && (
                        <span className="tnum text-[11px] text-bone-faint">
                          {timeAgo(c.last_message_at)}
                        </span>
                      )}
                      {c.unread > 0 && (
                        <span
                          className="h-2 w-2 rounded-full bg-gold"
                          aria-label={`${c.unread} unread`}
                        />
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Thread */}
            {activeId ? (
              <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-obsidian md:static md:z-auto md:h-[calc(100dvh-13rem)] md:min-h-[24rem] md:rounded-[24px] md:border md:border-gold/15 md:bg-panel/40 md:backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-steel-line px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] md:pt-2.5">
                  <button
                    type="button"
                    onClick={closeThread}
                    aria-label="Back to whispers"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel text-bone-mut md:hidden"
                  >
                    <Icon name="arrow" className="h-4 w-4 rotate-180" />
                  </button>
                  {active?.other?.handle ? (
                    <Link
                      href={`/u/${active.other.handle}`}
                      className="group flex min-w-0 flex-1 items-center gap-3"
                    >
                      <OtherAvatar
                        other={active.other}
                        className="h-8 w-8 text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-bone group-hover:text-gold">
                          {convoName(active)}
                        </p>
                        <p className="truncate text-xs text-bone-faint">
                          @{active.other.handle}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <OtherAvatar
                        other={active?.other ?? null}
                        className="h-8 w-8 text-xs"
                      />
                      <p className="truncate text-sm font-semibold text-bone">
                        {active ? convoName(active) : "Whisper"}
                      </p>
                    </div>
                  )}
                </div>

                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto px-3 py-3"
                >
                  {msgs === null ? (
                    <div className="flex flex-col gap-2">
                      <div className="glass-sm glass h-10 w-3/5 animate-pulse" />
                      <div className="glass-sm glass ml-auto h-10 w-1/2 animate-pulse" />
                      <div className="glass-sm glass h-10 w-2/5 animate-pulse" />
                    </div>
                  ) : msgs.length === 0 ? (
                    <p className="py-10 text-center text-sm text-bone-mut">
                      No words yet. Speak first.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {msgs.map((m) => {
                        const mine = meId !== null && m.sender_id === meId;
                        return (
                          <div
                            key={m.id}
                            className={`flex max-w-[86%] items-end gap-2 ${
                              mine ? "flex-row-reverse self-end" : "self-start"
                            } ${m.pending ? "opacity-70" : ""}`}
                          >
                            {!mine && (
                              <OtherAvatar
                                other={active?.other ?? null}
                                className="h-6 w-6 text-[10px]"
                              />
                            )}
                            <div
                              className={`flex min-w-0 flex-col ${
                                mine ? "items-end" : "items-start"
                              }`}
                            >
                            <div
                              className={`${
                                mine
                                  ? "glass glass-warm rounded-br-sm"
                                  : "glass glass-sm rounded-bl-sm"
                              } overflow-hidden rounded-2xl ${
                                m.image_url && !m.body
                                  ? "p-1"
                                  : "px-3.5 py-2"
                              }`}
                            >
                              {m.image_url && (
                                <button
                                  type="button"
                                  onClick={() => setLightbox(m.image_url)}
                                  className={`group block overflow-hidden rounded-xl border border-steel-line/60 ${
                                    m.body ? "mb-2" : ""
                                  }`}
                                  aria-label="Open image full size"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={m.image_url}
                                    alt="Whispered image"
                                    loading="lazy"
                                    className="max-h-64 w-full max-w-[16rem] object-cover transition duration-200 group-hover:brightness-110"
                                  />
                                </button>
                              )}
                              {m.body && (
                                <p className="whitespace-pre-wrap break-words text-sm text-bone">
                                  {m.body}
                                </p>
                              )}
                            </div>
                            <span className="tnum mt-0.5 px-1 text-[10px] text-bone-faint">
                              {m.pending ? "Sending" : timeAgo(m.created_at)}
                            </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {sendErr && (
                  <p className="border-t border-steel-line px-3 pt-2 text-xs text-ember">
                    {sendErr}
                  </p>
                )}

                {pendingImage && (
                  <div className="flex items-center gap-3 border-t border-steel-line px-3 pt-2.5">
                    <span className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pendingImage}
                        alt="Attachment preview"
                        className="h-16 w-16 rounded-lg border border-steel-line object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingImage(null)}
                        aria-label="Remove image"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-steel-line bg-panel text-bone-mut"
                      >
                        <Icon name="plus" className="h-3 w-3 rotate-45" />
                      </button>
                    </span>
                    <span className="text-xs text-bone-faint">
                      Ready to send
                    </span>
                  </div>
                )}

                <form
                  onSubmit={(e) => void send(e)}
                  className="flex items-center gap-2 border-t border-steel-line px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:pb-2.5"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void pickImage(e)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || Boolean(pendingImage)}
                    aria-label="Attach image"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-steel-line bg-panel text-bone-mut transition hover:text-gold disabled:opacity-50"
                  >
                    {uploading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-steel-line border-t-gold" />
                    ) : (
                      <Icon name="image" className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Speak softly"
                    className="w-full rounded-xl border border-steel-line bg-panel px-3.5 py-2.5 text-sm text-bone placeholder:text-bone-faint focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sending || !canSend}
                    aria-label="Send whisper"
                    className="btn-gold flex h-10 w-10 shrink-0 items-center justify-center disabled:opacity-50"
                  >
                    <Icon name="send" className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="hidden h-[calc(100dvh-13rem)] min-h-[24rem] md:block">
                <div className="glass flex h-full flex-col items-center justify-center p-8 text-center">
                  <Icon name="mail" className="h-7 w-7 text-bone-faint" />
                  <p className="mt-3 text-sm text-bone-mut">
                    Choose a whisper from the corridor, or begin a new one.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Full-size image */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close image"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-steel-line bg-panel text-bone-mut"
          >
            <Icon name="plus" className="h-5 w-5 rotate-45" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Whispered image"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-full rounded-2xl border border-steel-line object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
