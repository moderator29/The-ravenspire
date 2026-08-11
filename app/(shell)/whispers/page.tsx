"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { AdaptiveDialog, useIsMobile } from "@/components/ui/sheet";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/social/types";

/* Whispers, as the Stream archetype: one 640px column, comfortable density, a
   constant gap with variable card heights. It was a 5xl two pane corridor,
   which is a Console shape wearing a Stream's content, and the desktop half of
   it had no way back out of an open thread at all.

   The thread is the same conversation at both widths but not the same layout:
   a full screen surface under `md`, where a phone should give a conversation
   the whole screen, and a panel in the column above it. */

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

/* The recipient's portrait: their real avatar when they have one, otherwise
   the initial on the house-panel disc used everywhere else in the corridor.
   A circle here is correct: avatars are the one shape exempt from the
   rounded rectangle rule. */
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
        className={cx(
          "shrink-0 rounded-[var(--radius-full)] border border-steel-line object-cover",
          className
        )}
      />
    );
  }
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-full)]",
        "border border-steel-line bg-panel font-display text-gold",
        className
      )}
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
  const isMobile = useIsMobile();

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
  const composerRef = useRef<HTMLInputElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  /* Mirrors the open thread for the realtime handler, which must be able to
     drop a payload that lands after the member has moved on. Written in an
     effect rather than during render: a ref touched in the render body is a
     React correctness error, and this one was. */
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

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
  }, [msgs, activeId, isMobile]);

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

  const showCorridorSkeleton = useDelayedLoading(
    !ready || (authenticated && convos === null),
    300
  );
  const showThreadSkeleton = useDelayedLoading(msgs === null, 300);
  const showHitsSkeleton = useDelayedLoading(searching && hits === null, 300);

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
  const canSend =
    (body.trim().length > 0 || Boolean(pendingImage)) && !uploading;

  /* ── The open thread ──────────────────────────────────────────────────── */

  const threadHeader = (
    <div className="flex items-center gap-3 border-b border-steel-line px-3 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] md:pt-2.5">
      <IconButton
        icon="arrow"
        label="Back to whispers"
        onClick={closeThread}
        className="shrink-0 [&_svg]:rotate-180"
      />
      {active?.other?.handle ? (
        <Link
          href={`/u/${active.other.handle}`}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <OtherAvatar other={active.other} className="h-8 w-8 text-xs" />
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
          <OtherAvatar other={active?.other ?? null} className="h-8 w-8 text-xs" />
          <p className="truncate text-sm font-semibold text-bone">
            {active ? convoName(active) : "Whisper"}
          </p>
        </div>
      )}
    </div>
  );

  const threadBody = (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-3"
      aria-live="polite"
    >
      {msgs === null ? (
        showThreadSkeleton ? (
          <div className="flex flex-col gap-2">
            <Skeleton radius="xl" className="h-10 w-3/5" />
            <Skeleton radius="xl" className="ml-auto h-10 w-1/2" />
            <Skeleton radius="xl" className="h-10 w-2/5" />
          </div>
        ) : null
      ) : msgs.length === 0 ? (
        <EmptyState
          size="sm"
          icon="send"
          title="No words yet"
          body="Nothing has passed between you two. Say the first thing."
          action={
            <Button size="sm" onClick={() => composerRef.current?.focus()}>
              Speak first
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {msgs.map((m) => {
            const mine = meId !== null && m.sender_id === meId;
            return (
              <div
                key={m.id}
                className={cx(
                  "flex max-w-[86%] items-end gap-2",
                  mine ? "flex-row-reverse self-end" : "self-start",
                  m.pending && "opacity-70"
                )}
              >
                {!mine && (
                  <OtherAvatar
                    other={active?.other ?? null}
                    className="h-6 w-6 text-[10px]"
                  />
                )}
                <div
                  className={cx(
                    "flex min-w-0 flex-col",
                    mine ? "items-end" : "items-start"
                  )}
                >
                  <Card
                    variant={mine ? "warm" : "default"}
                    pad="none"
                    className={cx(
                      "overflow-hidden",
                      mine ? "rounded-br-sm" : "rounded-bl-sm",
                      m.image_url && !m.body ? "p-1" : "px-3.5 py-2"
                    )}
                  >
                    {m.image_url && (
                      <button
                        type="button"
                        onClick={() => setLightbox(m.image_url)}
                        className={cx(
                          "group block overflow-hidden rounded-lg border border-steel-line/60",
                          m.body && "mb-2"
                        )}
                        aria-label="Open image full size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={m.image_url}
                          alt="Whispered image"
                          loading="lazy"
                          className="max-h-64 w-full max-w-[16rem] object-cover transition-[filter] duration-fast ease-out-quint group-hover:brightness-110"
                        />
                      </button>
                    )}
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words text-sm text-bone">
                        {m.body}
                      </p>
                    )}
                  </Card>
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
  );

  const threadFooter = (
    <>
      {sendErr && (
        <p
          role="alert"
          className="flex items-center gap-2 border-t border-steel-line px-3 pt-2 text-xs text-state-danger"
        >
          <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
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
              className="h-16 w-16 rounded-md border border-steel-line object-cover"
            />
            <IconButton
              icon="close"
              label="Remove image"
              size="sm"
              shape="circle"
              variant="glass"
              onClick={() => setPendingImage(null)}
              className="absolute -right-2 -top-2 h-6 w-6"
            />
          </span>
          <span className="text-xs text-bone-faint">Ready to send</span>
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
        {/* A Button rather than an IconButton, because the upload needs the
            spinner and only Button carries one. */}
        <Button
          variant="ghost"
          size="lg"
          aria-label="Attach image"
          loading={uploading}
          disabled={Boolean(pendingImage)}
          onClick={() => fileRef.current?.click()}
          className="w-11 shrink-0 px-0"
        >
          {uploading ? null : <Icon name="image" className="h-5 w-5" />}
        </Button>
        <Field className="min-w-0 flex-1">
          <Input
            ref={composerRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Whisper"
            placeholder="Speak softly"
            className="min-h-11"
          />
        </Field>
        <IconButton
          type="submit"
          icon="send"
          label="Send whisper"
          variant="gold"
          size="lg"
          disabled={sending || !canSend}
        />
      </form>
    </>
  );

  /* ── The corridor ─────────────────────────────────────────────────────── */

  const corridor =
    convos === null ? (
      showCorridorSkeleton ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} pad="sm" className="flex items-center gap-3">
              <Skeleton radius="full" className="h-10 w-10 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton radius="sm" className="h-3.5 w-2/5" />
                <Skeleton radius="sm" className="h-3 w-1/4" />
              </div>
            </Card>
          ))}
        </div>
      ) : null
    ) : convos.length === 0 ? (
      <EmptyState
        bordered
        icon="send"
        title="No whispers yet"
        body="Find a Keep at the Crossroads and speak. Whispers travel only between two citizens."
        action={
          <Button variant="gold" render={<Link href="/explore" />}>
            To the Crossroads
          </Button>
        }
      />
    ) : (
      <div className="flex flex-col gap-3">
        {convos.map((c) => (
          <Card
            key={c.id}
            interactive
            pad="sm"
            className="flex w-full items-center gap-3 text-left"
            render={
              <button type="button" onClick={() => openThread(c.id)} />
            }
          >
            {/* The Stream's accent rail, earned: it marks the threads still
                waiting on you, and nothing else. */}
            {c.unread > 0 && (
              <span
                aria-hidden
                className="absolute inset-y-3 left-0 w-[2px] rounded-[var(--radius-full)] bg-gold"
              />
            )}
            <OtherAvatar other={c.other} className="h-10 w-10 text-sm" />
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
                  className="h-2 w-2 rounded-[var(--radius-full)] bg-gold"
                  aria-label={`${c.unread} unread`}
                />
              )}
            </span>
          </Card>
        ))}
      </div>
    );

  /* ── The page ─────────────────────────────────────────────────────────── */

  const threadOpen = Boolean(activeId);

  return (
    <div className="mx-auto w-full max-w-[640px] px-3 py-4 sm:px-4 sm:py-6">
      {!threadOpen && (
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
            <Button
              onClick={() => {
                setComposeOpen(true);
                setComposeErr(null);
              }}
            >
              <Icon name="plus" className="h-4 w-4" />
              New whisper
            </Button>
          )}
        </div>
      )}

      {!ready ? (
        showCorridorSkeleton ? (
          <div className="mt-5 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} pad="sm" className="flex items-center gap-3">
                <Skeleton radius="full" className="h-10 w-10 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton radius="sm" className="h-3.5 w-2/5" />
                  <Skeleton radius="sm" className="h-3 w-1/4" />
                </div>
              </Card>
            ))}
          </div>
        ) : null
      ) : !authenticated ? (
        <div className="mt-5">
          <EmptyState
            bordered
            icon="mail"
            title="Whispers travel only between citizens"
            body="Enter the realm to open a private line to another Keep."
            action={
              <Button variant="gold" render={<Link href="/signin" />}>
                Enter the realm
              </Button>
            }
          />
        </div>
      ) : threadOpen ? (
        isMobile ? (
          /* A phone gives the conversation the whole screen. */
          <div className="fixed inset-0 z-modal flex flex-col overflow-hidden bg-obsidian">
            {threadHeader}
            {threadBody}
            {threadFooter}
          </div>
        ) : (
          <Card
            pad="none"
            className="mt-4 flex h-[calc(100dvh-13rem)] min-h-[24rem] flex-col overflow-hidden"
          >
            {threadHeader}
            {threadBody}
            {threadFooter}
          </Card>
        )
      ) : (
        <div className="mt-4">{corridor}</div>
      )}

      {/* New whisper. A sheet on a phone, a modal above it, portalled either
          way, so it can never be clipped by the column it opened from. */}
      <AdaptiveDialog
        open={composeOpen}
        onOpenChange={(next) => {
          setComposeOpen(next);
          if (!next) {
            setQuery("");
            setHits(null);
            setComposeErr(null);
          }
        }}
        title="New whisper"
        description="Search citizens by handle."
      >
        <div className="flex flex-col gap-3">
          <Field>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search citizens by handle"
              placeholder="Search citizens by handle"
              className="min-h-11"
            />
          </Field>

          {composeErr && (
            <p
              role="alert"
              className="flex items-center gap-2 text-xs text-state-danger"
            >
              <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
              {composeErr}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {searching && hits === null ? (
              showHitsSkeleton ? (
                [0, 1].map((i) => (
                  <Card key={i} pad="sm" className="flex items-center gap-3">
                    <Skeleton radius="full" className="h-9 w-9 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Skeleton radius="sm" className="h-3.5 w-2/5" />
                      <Skeleton radius="sm" className="h-3 w-1/4" />
                    </div>
                  </Card>
                ))
              ) : null
            ) : hits && hits.length === 0 ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No citizen answers to that handle"
                body="Check the spelling, or find them at the Crossroads."
                action={
                  <Button size="sm" render={<Link href="/explore" />}>
                    To the Crossroads
                  </Button>
                }
              />
            ) : (
              (hits ?? []).map((p) => (
                <Card
                  key={p.id}
                  interactive
                  pad="sm"
                  className="flex w-full items-center gap-3 text-left"
                  render={
                    <button
                      type="button"
                      disabled={starting !== null}
                      onClick={() => void startWhisper(p)}
                    />
                  }
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-full)] border border-steel-line bg-panel font-display text-sm text-gold">
                    {(p.display_name ?? p.handle ?? "?").slice(0, 1).toUpperCase()}
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
                    <Icon name="send" className="h-4 w-4 shrink-0 text-gold" />
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      </AdaptiveDialog>

      {/* Full size image. A real dialog now: focus trapped, Escape closes, and
          portalled to the body rather than layered inside the column. */}
      <Modal
        open={Boolean(lightbox)}
        onOpenChange={(next) => {
          if (!next) setLightbox(null);
        }}
        title="Whispered image"
        size="lg"
      >
        {lightbox && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lightbox}
            alt="Whispered image"
            className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-lg border border-steel-line object-contain"
          />
        )}
      </Modal>
    </div>
  );
}
