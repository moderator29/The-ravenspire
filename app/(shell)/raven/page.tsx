"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/button";
import { BackButton } from "@/components/shell/back-button";
import { ChatInput } from "@/components/raven/chat-input";
import { MessageList } from "@/components/raven/message-list";
import { SettingsSheet } from "@/components/raven/settings-sheet";
import { HistoryPanel } from "@/components/raven/history-panel";
import { realmFetchStream } from "@/lib/auth/api";
import { readRavenStream } from "@/lib/raven/stream";
import { useRavenHistory } from "@/components/raven/use-history";
import {
  VOICE_KEY,
  BROWSE_KEY,
  LENGTH_KEY,
  LANGUAGE_KEY,
  LANGUAGES,
  type Msg,
  type Voice,
  type Length,
  type Language,
  type TokenCard,
  type WalletCard,
  type Source,
} from "@/components/raven/types";
import type { RealmPulse } from "@/components/raven/cards";

/* Append the wait to a rate limit message, in the units a person thinks in.
   The server answers in seconds, which reads badly past a minute or two. */
function withWait(message: string, retryAfter?: number): string {
  if (!retryAfter || retryAfter <= 0) return message;
  const mins = Math.ceil(retryAfter / 60);
  const wait =
    retryAfter < 90
      ? `${Math.ceil(retryAfter)} seconds`
      : mins < 60
        ? `${mins} minutes`
        : `${Math.ceil(mins / 60)} hours`;
  return `${message} Try again in about ${wait}.`;
}

export default function RavenPage() {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /* The current reply as it is spoken, shown as its own live bubble until the
     server's `done` event lands and the turn completes for real. Null before
     the first token arrives (MessageList still shows the plain "thinking"
     dots for that gap) and reset to null the moment a turn finishes, one way
     or another. */
  const [streamingText, setStreamingText] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [voice, setVoice] = useState<Voice>("default");
  const [browse, setBrowse] = useState(false);
  const [length, setLength] = useState<Length>("normal");
  const [language, setLanguage] = useState<Language>("auto");

  /* Conversations, the active thread and the transcript all live in one hook,
     because on the server they are one thing: a member's history. The page
     keeps what is genuinely the page's, which is the draft, the busy flag and
     the four preferences. */
  const history = useRavenHistory();
  const { messages } = history;

  const scrollerRef = useRef<HTMLDivElement>(null);

  /* Restore the four preferences. History restores itself inside the hook. */
  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_KEY);
      if (v === "default" || v === "lore" || v === "normal" || v === "degen")
        setVoice(v);
      const l = localStorage.getItem(LENGTH_KEY);
      if (l === "brief" || l === "normal" || l === "detailed") setLength(l);
      if (localStorage.getItem(BROWSE_KEY) === "1") setBrowse(true);
      /* Validated against the shared list rather than a second literal union,
         so a language removed from the list stops being restorable here
         without anyone having to remember this line. */
      const lang = localStorage.getItem(LANGUAGE_KEY);
      if (lang && LANGUAGES.some((l) => l.id === lang))
        setLanguage(lang as Language);
    } catch {
      /* storage unavailable, defaults are fine */
    }
  }, []);

  const persist = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  };

  /* Keep the transcript pinned to the newest message. */
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, streamingText]);

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    const question: Msg = { role: "user", content };
    const next: Msg[] = [...messages, question];
    /* The question shows now and is held. It is written only once the Herald
       answers, so an interrupted send does not leave a one line thread with no
       reply sitting in the drawer. */
    history.beginTurn(question);
    setDraft("");
    setBusy(true);
    setStreamingText(null);
    try {
      const payload = next
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await realmFetchStream("/api/raven", {
        method: "POST",
        json: { messages: payload, voice, browse, length, language },
      });

      if (!res) {
        history.completeTurn({
          role: "error",
          content: "The winds swallowed your message. Try again shortly.",
        });
        return;
      }

      if (!res.ok) {
        /* Refused before a single token was spent: no key configured, not
           signed in, or the hourly spend cap. The server's own words, never
           ours over the top of them, same as before this route streamed. */
        let data: { error?: string; retryAfter?: number } | null = null;
        try {
          data = (await res.json()) as { error?: string; retryAfter?: number };
        } catch {
          data = null;
        }
        history.completeTurn({
          role: "error",
          content: withWait(
            data?.error ?? "The Raven is preoccupied. Try again shortly.",
            res.status === 429 ? data?.retryAfter : undefined
          ),
        });
        return;
      }

      type DoneResult = {
        reply?: string;
        cards?: TokenCard[];
        walletCard?: WalletCard | null;
        pulse?: RealmPulse | null;
        suggestions?: string[];
        sources?: Source[];
        browsed?: boolean;
        browseRequested?: boolean;
        browseAvailable?: boolean;
      };

      let liveText = "";
      let sawError = false;
      let final: DoneResult | null = null;

      await readRavenStream(res, (event) => {
        if (event.type === "text") {
          liveText += event.text;
          setStreamingText(liveText);
        } else if (event.type === "done") {
          final = event.result as DoneResult;
        } else if (event.type === "error") {
          sawError = true;
        }
      });

      if (final) {
        const f: DoneResult = final;
        history.completeTurn({
          role: "assistant",
          content: f.reply ?? liveText,
          cards:
            Array.isArray(f.cards) && f.cards.length ? f.cards : undefined,
          walletCard: f.walletCard ?? undefined,
          pulse: f.pulse ?? undefined,
          suggestions:
            Array.isArray(f.suggestions) && f.suggestions.length
              ? f.suggestions
              : undefined,
          sources:
            Array.isArray(f.sources) && f.sources.length
              ? f.sources
              : undefined,
          browsed: f.browsed,
          browseRequested: f.browseRequested,
          browseAvailable: f.browseAvailable,
        });
      } else if (liveText) {
        /* The connection dropped before `done` arrived, but real words were
           already spoken and already on screen. Keeping them as a plain
           assistant message is the honest choice: replacing what a member
           just watched appear with an error line would be a worse lie than
           an answer with no follow-up chips. */
        history.completeTurn({ role: "assistant", content: liveText });
      } else {
        history.completeTurn({
          role: "error",
          content: sawError
            ? "The Raven is preoccupied. Try again shortly."
            : "The winds swallowed your message. Try again shortly.",
        });
      }
    } catch {
      history.completeTurn({
        role: "error",
        content: "The winds swallowed your message. Try again shortly.",
      });
    } finally {
      setStreamingText(null);
      setBusy(false);
    }
  };

  const startNewChat = () => {
    history.startNewChat();
    setDraft("");
    setHistoryOpen(false);
  };

  const selectConversation = (id: string) => {
    history.selectConversation(id);
    setHistoryOpen(false);
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
  const setLanguagePref = (l: Language) => {
    setLanguage(l);
    persist(LANGUAGE_KEY, l);
  };

  return (
    /* A conversation owns the whole viewport. The shell drops its dock, its
       right rail and its mobile top bar for this route (lib/nav fullBleed), so
       the three regions below are the only things on screen: a header that
       does not scroll, a transcript that is the only thing that does, and a
       composer against the bottom edge. 100dvh rather than 100vh, because on
       iOS Safari the difference is the address bar and using vh puts the
       composer underneath it. */
    <div className="flex h-[100dvh] w-full flex-col">
      {/* Back on the left, identity in the middle, history on the right. Three
          slots, and nothing else: every control that is not one of those three
          lives in the drawer, which is what keeps the header readable at
          390px. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-steel-line/70 bg-obsidian/70 px-3 py-3 backdrop-blur-sm sm:px-5">
        <BackButton circle />

        <div className="min-w-0 flex-1">
          <h1 className="gold-text truncate font-display text-lg font-semibold leading-tight">
            The Raven
          </h1>
          <p className="flex items-center gap-1.5 text-[12px] text-bone-mut">
            <span className="truncate">Beta</span>
            {browse && (
              <span className="inline-flex items-center gap-1 text-gold">
                <span className="h-1 w-1 rounded-full bg-gold" />
                Browsing
              </span>
            )}
          </p>
        </div>

        <IconButton
          icon="scroll"
          label="Conversations"
          variant="glass"
          shape="circle"
          size="lg"
          onClick={() => setHistoryOpen(true)}
        />
      </header>

      {/* Transcript: the only scrolling region, fills the middle. */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
      >
        <MessageList
          messages={messages}
          busy={busy}
          streamingText={streamingText}
          onSend={(t) => void send(t)}
        />
      </div>

      {/* Said out loud, never swallowed. A member who believes their history is
          safe and finds it gone has been lied to by the interface, and the only
          moment we can tell them is the moment the write fails. */}
      {history.syncError && (
        <p
          role="status"
          className="shrink-0 border-t border-state-danger/30 bg-state-danger/10 px-4 py-2 text-center text-[12px] text-bone-mut"
        >
          {history.syncError}
        </p>
      )}

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
        language={language}
        onVoice={setVoicePref}
        onBrowse={setBrowsePref}
        onLength={setLengthPref}
        onLanguage={setLanguagePref}
      />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={history.conversations}
        activeId={history.activeId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        onRename={history.renameConversation}
        onDelete={history.deleteConversation}
        onOpenSettings={() => {
          setHistoryOpen(false);
          setSettingsOpen(true);
        }}
        onClearAll={history.clearAll}
      />
    </div>
  );
}
