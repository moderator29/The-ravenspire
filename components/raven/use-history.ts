"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { MAX_CONVERSATIONS, MAX_TITLE_CHARS } from "@/lib/raven/history";
import {
  CONVOS_KEY,
  ACTIVE_KEY,
  type Conversation,
  type Msg,
} from "@/components/raven/types";

/* Where a member's Herald conversations actually live.
 *
 * They lived in localStorage, which meant clearing a browser erased every
 * conversation and a second device started blank. They now live on the server
 * for a signed in member, behind the routes in app/api/raven/conversations.
 *
 * localStorage does not go away, it changes job. It is the store for a member
 * who is not signed in, and it is the boot cache for one who is: the drawer
 * draws from it on the first frame and is replaced by the server's list the
 * moment that arrives. Waiting on the network to draw a list we already have
 * would be a spinner over known data.
 *
 * The one rule this file holds to is that it never claims a conversation is
 * saved when it is not. Every server write that fails sets `syncError`, and the
 * surface says so, because a member who believes their history is safe and
 * finds it gone has been lied to by the interface.
 */

type ServerConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ServerMessage = {
  id: string;
  role: Msg["role"];
  content: string;
  meta: Record<string, unknown> | null;
  seq: number;
};

/* The half of a Msg that is not role and content. The server stores it as an
   opaque `meta` blob on purpose, so these shapes can change without a
   migration, which means this pair of functions is the only place that knows
   the mapping. */
function toMeta(m: Msg): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  if (m.cards) meta.cards = m.cards;
  if (m.walletCard) meta.walletCard = m.walletCard;
  if (m.pulse) meta.pulse = m.pulse;
  if (m.suggestions) meta.suggestions = m.suggestions;
  if (m.sources) meta.sources = m.sources;
  if (m.browsed !== undefined) meta.browsed = m.browsed;
  if (m.browseRequested !== undefined) meta.browseRequested = m.browseRequested;
  if (m.browseAvailable !== undefined) meta.browseAvailable = m.browseAvailable;
  return meta;
}

function fromServer(row: ServerMessage): Msg {
  const meta = (row.meta ?? {}) as Partial<Msg>;
  return {
    role: row.role,
    content: row.content,
    cards: meta.cards,
    walletCard: meta.walletCard,
    pulse: meta.pulse,
    suggestions: meta.suggestions,
    sources: meta.sources,
    browsed: meta.browsed,
    browseRequested: meta.browseRequested,
    browseAvailable: meta.browseAvailable,
  };
}

function titleFor(messages: Msg[]): string {
  const first = messages.find((m) => m.role === "user");
  return (first?.content ?? "New chat").trim().slice(0, 60) || "New chat";
}

function localId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function readLocal(): { conversations: Conversation[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(CONVOS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    const conversations = Array.isArray(parsed) ? parsed : [];
    return { conversations, activeId: localStorage.getItem(ACTIVE_KEY) };
  } catch {
    return { conversations: [], activeId: null };
  }
}

function writeLocal(conversations: Conversation[], activeId: string | null) {
  try {
    localStorage.setItem(CONVOS_KEY, JSON.stringify(conversations));
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* Storage can be full or blocked. The in memory state is still correct,
       and in server mode the server already has the truth. */
  }
}

export interface RavenHistory {
  conversations: Conversation[];
  activeId: string | null;
  messages: Msg[];
  /* False until the first read (local, then server) has settled, so the
     surface can avoid drawing an empty state over history that is arriving. */
  ready: boolean;
  /* True while a conversation's messages are being fetched. */
  loading: boolean;
  /* Set when a server write failed. The surface must say so rather than let a
     member believe an unsaved conversation is saved. */
  syncError: string | null;
  /* True when history is on the server rather than only in this browser. */
  persisted: boolean;
  startNewChat: () => void;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  clearAll: () => void;
  /* A send, in two halves. The member's message shows the instant they send it
     and is held; the Herald's answer completes the turn, and the pair is
     written together. Splitting it this way is what makes a write an append of
     two rows rather than a re-upload of the whole thread per message. */
  beginTurn: (question: Msg) => void;
  completeTurn: (answer: Msg) => void;
}

export function useRavenHistory(): RavenHistory {
  const auth = useRealmAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);

  /* Refs, not state, for anything a callback reads mid flight. `recordTurn`
     runs inside an async send and would otherwise close over the active id as
     it was when the send started, which is exactly the stale closure that made
     the feed paginate the same page twice. */
  const activeRef = useRef<string | null>(null);
  const persistedRef = useRef(false);
  const migratedRef = useRef(false);

  const setActive = useCallback((id: string | null) => {
    activeRef.current = id;
    setActiveId(id);
  }, []);

  /* The member's half of a turn. Shown at once, and held rather than written,
     because a question with no answer beside it is not yet a conversation and
     an interrupted send should not leave a one line thread in the drawer. */
  const pendingRef = useRef<Msg | null>(null);

  /* The current thread, for the writer. `messages` state cannot be read from
     inside an async send without closing over its value at the moment the send
     started, which is the stale closure that had the feed request the same page
     twice. */
  const allRef = useRef<Msg[]>([]);
  useEffect(() => {
    allRef.current = messages;
  }, [messages]);

  /* Written as a plain function rather than a callback so `completeTurn` does
     not depend on its identity. Everything mutable it needs comes from a ref. */
  async function persist(turns: Msg[]) {
    const all = allRef.current;
    const title = titleFor(all);

    if (!persistedRef.current) {
      const id = activeRef.current ?? localId();
      if (!activeRef.current) setActive(id);
      setConversations((prev) => [
        { id, title, messages: all, updatedAt: Date.now() },
        ...prev.filter((c) => c.id !== id),
      ]);
      return;
    }

    const body = {
      messages: turns.map((m) => ({
        role: m.role,
        content: m.content,
        meta: toMeta(m),
      })),
    };

    if (!activeRef.current) {
      const { ok, data } = await realmFetch<{ conversation?: ServerConversation }>(
        "/api/raven/conversations",
        { method: "POST", json: { title, ...body } }
      );
      if (!ok || !data?.conversation) {
        setSyncError("This conversation is not being saved.");
        return;
      }
      const created = data.conversation;
      setActive(created.id);
      setSyncError(null);
      setConversations((prev) =>
        [
          {
            id: created.id,
            title: created.title,
            messages: all,
            updatedAt: new Date(created.updated_at).getTime(),
          },
          ...prev,
        ].slice(0, MAX_CONVERSATIONS)
      );
      return;
    }

    const id = activeRef.current;
    const { ok } = await realmFetch(`/api/raven/conversations/${id}`, {
      method: "POST",
      json: body,
    });
    if (!ok) {
      setSyncError("The last message was not saved.");
      return;
    }
    setSyncError(null);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, title: c.title || title, messages: all, updatedAt: Date.now() }
          : c
      )
    );
  }

  /* Push a browser's history up on first sign in. Sequential rather than
     parallel: forty creates at once against a rate limited route is a good way
     to have half of them rejected, and this runs exactly once in a member's
     life. */
  async function uploadLocal(local: Conversation[]): Promise<Conversation[]> {
    const out: Conversation[] = [];
    for (const convo of local.slice(0, MAX_CONVERSATIONS)) {
      if (convo.messages.length === 0) continue;
      const { ok, data } = await realmFetch<{
        conversation?: ServerConversation;
      }>("/api/raven/conversations", {
        method: "POST",
        json: {
          title: convo.title,
          messages: convo.messages.map((m) => ({
            role: m.role,
            content: m.content,
            meta: toMeta(m),
          })),
        },
      });
      if (!ok || !data?.conversation) continue;
      out.push({
        id: data.conversation.id,
        title: data.conversation.title,
        messages: convo.messages,
        updatedAt: new Date(data.conversation.updated_at).getTime(),
      });
    }
    return out;
  }


  /* Boot. The local read is synchronous and paints immediately; the server read
     follows and takes over when it answers. */
  useEffect(() => {
    const local = readLocal();
    setConversations(local.conversations);
    if (local.activeId) {
      const found = local.conversations.find((c) => c.id === local.activeId);
      if (found) {
        setActive(found.id);
        setMessages(found.messages);
      }
    }
    setReady(true);
  }, [setActive]);

  /* Take the server's list once the member is known to be signed in. Runs again
     if they sign in during the session, which is the case that would otherwise
     leave someone typing into a history that is never saved. */
  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    let cancelled = false;

    void (async () => {
      const { ok, data } = await realmFetch<{
        conversations?: ServerConversation[];
      }>("/api/raven/conversations");
      if (cancelled || !ok || !data?.conversations) return;

      const server = data.conversations.map<Conversation>((c) => ({
        id: c.id,
        title: c.title,
        messages: [],
        updatedAt: new Date(c.updated_at).getTime(),
      }));

      persistedRef.current = true;
      setPersisted(true);

      /* Migration, once per session and only into an empty account. A member
         who has been talking to the Herald in this browser keeps that history
         when they sign in, rather than watching it vanish behind a blank
         drawer. Only when the server has none, because uploading local copies
         on top of a real server history would duplicate every thread on every
         device the member has ever used. */
      const local = readLocal().conversations;
      if (server.length === 0 && local.length > 0 && !migratedRef.current) {
        migratedRef.current = true;
        const uploaded = await uploadLocal(local);
        if (!cancelled && uploaded.length) {
          setConversations(uploaded);
          /* The local copies are now duplicates of server rows under different
             ids. Clearing them is what stops the next sign in migrating them a
             second time. */
          writeLocal([], null);
          setActive(null);
          setMessages([]);
          return;
        }
      }

      setConversations(server);
      /* A local active id names a conversation that no longer exists in this
         list, so the thread on screen belongs to the browser, not the account.
         Starting clean is honest; keeping it would show a thread that no
         further message can be appended to. */
      if (activeRef.current && !server.some((c) => c.id === activeRef.current)) {
        setActive(null);
        setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.ready, auth.authenticated, setActive]);

  /* Mirror to localStorage only while it is the store. In server mode the
     server holds the truth and a stale local copy is a second source of it. */
  useEffect(() => {
    if (!ready || persisted) return;
    writeLocal(conversations, activeId);
  }, [conversations, activeId, ready, persisted]);

  const startNewChat = useCallback(() => {
    setActive(null);
    setMessages([]);
    setSyncError(null);
  }, [setActive]);

  const selectConversation = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      setActive(id);
      setSyncError(null);

      /* Locally stored conversations carry their messages. Server ones carry a
         title and a timestamp, and their transcript is fetched on demand, which
         is why the list route deliberately does not return forty transcripts to
         draw forty rows. */
      if (!persistedRef.current || convo.messages.length > 0) {
        setMessages(convo.messages);
        return;
      }

      setMessages([]);
      setLoading(true);
      void (async () => {
        const { ok, data } = await realmFetch<{ messages?: ServerMessage[] }>(
          `/api/raven/conversations/${id}`
        );
        setLoading(false);
        if (activeRef.current !== id) return;
        if (!ok || !data?.messages) {
          setSyncError("That conversation could not be opened.");
          return;
        }
        const loaded = data.messages.map(fromServer);
        setMessages(loaded);
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, messages: loaded } : c))
        );
      })();
    },
    [conversations, setActive]
  );

  /* A title a member chose, rather than the first sixty characters of whatever
     they happened to type first. Applied locally at once and sent after: a
     rename that waits on a round trip feels broken on a slow connection, and
     the failure path already exists and says so. */
  const renameConversation = useCallback((id: string, title: string) => {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_CHARS);
    if (!clean) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: clean } : c))
    );
    if (!persistedRef.current) return;
    void (async () => {
      const { ok } = await realmFetch(`/api/raven/conversations/${id}`, {
        method: "PATCH",
        json: { title: clean },
      });
      if (!ok) setSyncError("That conversation could not be renamed.");
      else setSyncError(null);
    })();
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeRef.current === id) {
        setActive(null);
        setMessages([]);
      }
      if (!persistedRef.current) return;
      void realmFetch(`/api/raven/conversations/${id}`, { method: "DELETE" });
    },
    [setActive]
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setActive(null);
    setMessages([]);
    writeLocal([], null);
    if (!persistedRef.current) return;
    void realmFetch("/api/raven/conversations", { method: "DELETE" });
  }, [setActive]);


  const beginTurn = useCallback((question: Msg) => {
    pendingRef.current = question;
    const next = [...allRef.current, question];
    allRef.current = next;
    setMessages(next);
  }, []);

  /* The Herald's half, which completes the exchange and writes both.
   *
   * History used to be derived from an effect on the message array, so every
   * render of a growing thread rewrote the whole thread into storage. Against a
   * server that is a full transcript upload per message. An append is an
   * append.
   *
   * The write is fired from here rather than from inside a state updater. An
   * updater has to be pure: React invokes it more than once in development, and
   * a fetch inside one is a duplicate write nobody sees until it is two
   * duplicate rows in a member's history. */
  const completeTurn = useCallback((answer: Msg) => {
    const question = pendingRef.current;
    pendingRef.current = null;
    const next = [...allRef.current, answer];
    allRef.current = next;
    setMessages(next);
    void persist(question ? [question, answer] : [answer]);
    /* `persist` is deliberately not a dependency. It is redeclared every render
       and reads everything mutable from a ref, so listing it would rebuild this
       callback on every render for no behavioural difference. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    conversations,
    activeId,
    messages,
    ready,
    loading,
    syncError,
    persisted,
    startNewChat,
    selectConversation,
    renameConversation,
    deleteConversation,
    clearAll,
    beginTurn,
    completeTurn,
  };
}
