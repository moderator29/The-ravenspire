"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ChatInput } from "@/components/raven/chat-input";
import { MessageList } from "@/components/raven/message-list";
import { SettingsSheet } from "@/components/raven/settings-sheet";
import { HistoryPanel } from "@/components/raven/history-panel";
import { realmFetch } from "@/lib/auth/api";
import {
  VOICES,
  VOICE_KEY,
  BROWSE_KEY,
  LENGTH_KEY,
  CONVOS_KEY,
  ACTIVE_KEY,
  type Msg,
  type Voice,
  type Length,
  type Conversation,
  type TokenCard,
  type WalletCard,
  type Source,
} from "@/components/raven/types";
import type { RealmPulse } from "@/components/raven/cards";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export default function RavenPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [voice, setVoice] = useState<Voice>("default");
  const [browse, setBrowse] = useState(false);
  const [length, setLength] = useState<Length>("normal");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);

  /* Restore settings + history once on mount. */
  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_KEY);
      if (v === "default" || v === "lore" || v === "normal" || v === "degen")
        setVoice(v);
      const l = localStorage.getItem(LENGTH_KEY);
      if (l === "brief" || l === "normal" || l === "detailed") setLength(l);
      if (localStorage.getItem(BROWSE_KEY) === "1") setBrowse(true);

      const rawConvos = localStorage.getItem(CONVOS_KEY);
      if (rawConvos) {
        const parsed = JSON.parse(rawConvos) as Conversation[];
        if (Array.isArray(parsed)) {
          setConversations(parsed);
          const active = localStorage.getItem(ACTIVE_KEY);
          const found = active ? parsed.find((c) => c.id === active) : null;
          if (found) {
            setMessages(found.messages);
            setActiveId(found.id);
            activeIdRef.current = found.id;
          }
        }
      }
    } catch {
      /* storage unavailable, defaults are fine */
    }
    setLoaded(true);
  }, []);

  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  };

  /* Fold the live thread into the saved history whenever it changes. */
  useEffect(() => {
    if (!loaded || messages.length === 0) return;
    let id = activeIdRef.current;
    if (!id) {
      id = newId();
      activeIdRef.current = id;
      setActiveId(id);
    }
    const firstUser = messages.find((m) => m.role === "user");
    const title =
      (firstUser?.content ?? "New chat").trim().slice(0, 60) || "New chat";
    const convoId = id;
    setConversations((prev) => {
      const others = prev.filter((c) => c.id !== convoId);
      return [
        { id: convoId, title, messages, updatedAt: Date.now() },
        ...others,
      ].slice(0, 40);
    });
  }, [messages, loaded]);

  /* Mirror history + active pointer into storage. */
  useEffect(() => {
    if (!loaded) return;
    persist(CONVOS_KEY, JSON.stringify(conversations));
  }, [conversations, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (activeId) persist(ACTIVE_KEY, activeId);
  }, [activeId, loaded]);

  /* Keep the transcript pinned to the newest message. */
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const payload = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const { ok: resOk, data } = await realmFetch<{
        reply?: string;
        cards?: TokenCard[];
        walletCard?: WalletCard | null;
        pulse?: RealmPulse | null;
        suggestions?: string[];
        sources?: Source[];
        browsed?: boolean;
        browseRequested?: boolean;
        error?: string;
      }>("/api/raven", {
        method: "POST",
        json: { messages: payload, voice, browse, length },
      });
      if (!resOk || !data?.reply) {
        setMessages((m) => [
          ...m,
          {
            role: "error",
            content:
              data?.error ?? "The Raven is preoccupied. Try again shortly.",
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.reply as string,
            cards:
              Array.isArray(data.cards) && data.cards.length
                ? data.cards
                : undefined,
            walletCard: data.walletCard ?? undefined,
            pulse: data.pulse ?? undefined,
            suggestions:
              Array.isArray(data.suggestions) && data.suggestions.length
                ? data.suggestions
                : undefined,
            sources:
              Array.isArray(data.sources) && data.sources.length
                ? data.sources
                : undefined,
            browsed: data.browsed,
            browseRequested: data.browseRequested,
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "error",
          content: "The winds swallowed your message. Try again shortly.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setActiveId(null);
    activeIdRef.current = null;
    setDraft("");
    setHistoryOpen(false);
  };

  const selectConversation = (id: string) => {
    const convo = conversations.find((c) => c.id === id);
    if (!convo) return;
    setMessages(convo.messages);
    setActiveId(id);
    activeIdRef.current = id;
    setHistoryOpen(false);
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeIdRef.current) {
      setMessages([]);
      setActiveId(null);
      activeIdRef.current = null;
    }
  };

  const setVoicePref = (v: Voice) => {
    setVoice(v);
    persist(VOICE_KEY, v);
  };
  const setBrowsePref = (b: boolean) => {
    setBrowse(b);
    persist(BROWSE_KEY, b ? "1" : "0");
  };
  const setLengthPref = (l: Length) => {
    setLength(l);
    persist(LENGTH_KEY, l);
  };

  const activeVoice = VOICES.find((v) => v.id === voice) ?? VOICES[0];

  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] w-full max-w-3xl flex-col lg:h-[calc(100dvh-2rem)]">
      {/* Header bar: thin, full width, border below like a real chat app. */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-steel-line/70 bg-obsidian/60 px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          aria-label="Chat history"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-steel-line/70 bg-panel text-bone-mut transition-colors hover:border-gold/35 hover:text-bone"
        >
          <Icon name="scroll" className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="gold-text font-display text-base font-semibold leading-tight">
            The Raven
          </h1>
          <p className="flex items-center gap-1.5 text-[11px] text-bone-mut">
            <span className="truncate">Voice: {activeVoice.label}</span>
            {browse && (
              <span className="inline-flex items-center gap-1 text-gold">
                <span className="h-1 w-1 rounded-full bg-gold" />
                Browsing
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={startNewChat}
          aria-label="New chat"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-steel-line/70 bg-panel text-bone-mut transition-colors hover:border-gold/35 hover:text-bone"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="AI settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-steel-line/70 bg-panel text-bone-mut transition-colors hover:border-gold/35 hover:text-bone"
        >
          <Icon name="sliders" className="h-4 w-4" />
        </button>
      </header>

      {/* Transcript: the only scrolling region, fills the middle. */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
      >
        <MessageList messages={messages} busy={busy} onSend={(t) => void send(t)} />
      </div>

      {/* Composer: pinned to the bottom of the column, full width, with a top
          border and safe-area padding so it is never crowded by the mobile
          bottom nav. */}
      <div className="shrink-0 border-t border-steel-line/60 bg-obsidian/60 px-3 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 backdrop-blur-sm sm:px-4">
        <div className="mx-auto w-full max-w-2xl">
          <ChatInput
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            busy={busy}
            browse={browse}
            onToggleBrowse={() => setBrowsePref(!browse)}
          />
        </div>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        voice={voice}
        browse={browse}
        length={length}
        onVoice={setVoicePref}
        onBrowse={setBrowsePref}
        onLength={setLengthPref}
      />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        onDelete={deleteConversation}
      />
    </div>
  );
}
