"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  ConsoleHeader,
  ConsolePage,
  ConsoleStack,
} from "@/components/console/console-shell";
import {
  CallForm,
  EMPTY_CALL_DRAFT,
  callDraftReady,
  callPayload,
  draftSentence,
  type CallDraft,
} from "@/components/calls/call-form";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { CallDirection } from "@/lib/calls/types";
import type { Post } from "@/lib/social/types";

/*
  Seal a Call, as its own page.

  This used to be a toggle inside the plain raven composer: one icon among
  images and polls, opening a form that then had to fit inside a box sized
  for a few lines of text. A Call is the realm's flagship, not an attachment,
  so it gets the same standing "Send a raven" and "Ask @raven" already have:
  its own destination from the same speed dial (components/shell/floating-
  compose.tsx), and room to actually show the difficulty preview, the stake
  window and the member's own record without being scrolled through a slot
  built for something else.

  The engine underneath (CallForm) is unchanged: same fields, same server
  validation in lib/calls/create.ts, same honest "no price, no Call" refusal.
  This page is the frame around it, plus a real, data-backed way to arrive at
  a coin in the first place rather than typing one cold.
*/

/* Real, live candidates to seal a Call on, not a suggestion pulled from
   nowhere: the same heating list the Scrying Glass itself shows, so a member
   picking one here is picking a coin the realm can already see moving. */
interface ScryCoin {
  symbol: string;
  change24h: number | null;
  chainShort: string;
}

function TrendingPicks({ onPick }: { onPick: (symbol: string) => void }) {
  const [coins, setCoins] = useState<ScryCoin[] | null>(null);

  useEffect(() => {
    let alive = true;
    void realmFetch<{ heating?: ScryCoin[] }>("/api/scrying").then((res) => {
      if (!alive) return;
      setCoins(res.ok ? (res.data?.heating ?? []).slice(0, 6) : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!coins || coins.length === 0) return null;

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
        <Icon name="signal" className="h-3.5 w-3.5 text-gold" />
        Heating up right now
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {coins.map((c) => {
          const up = (c.change24h ?? 0) >= 0;
          return (
            <button
              key={`${c.symbol}-${c.chainShort}`}
              type="button"
              onClick={() => onPick(c.symbol)}
              className="touch:min-h-11 inline-flex items-center gap-1.5 rounded-sm border border-steel-line px-2.5 py-1.5 text-xs text-bone-mut transition-colors duration-fast hover:border-gold/40 hover:text-bone"
            >
              <span className="font-semibold text-bone">{c.symbol}</span>
              <span className="text-[10px] text-bone-faint">{c.chainShort}</span>
              {c.change24h !== null && (
                <span
                  className="tnum"
                  style={{ color: up ? "var(--chart-up)" : "var(--chart-down)" }}
                >
                  {up ? "+" : ""}
                  {c.change24h.toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-bone-faint">
        Real movers straight from the Scrying Glass. Tap one to start, or
        type any coin below. Not a signal to Call it a certain way, only
        where to look.
      </p>
    </div>
  );
}

function NewCallSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticated } = useRealmAuth();

  const tokenParam = searchParams.get("token");
  const stanceParam = searchParams.get("stance");
  const initialStance: CallDirection | undefined =
    stanceParam === "up" || stanceParam === "down" ? stanceParam : undefined;

  const [draft, setDraft] = useState<CallDraft>(() =>
    tokenParam
      ? {
          ...EMPTY_CALL_DRAFT,
          token: tokenParam.slice(0, 12).toUpperCase(),
          stance: initialStance ?? EMPTY_CALL_DRAFT.stance,
        }
      : EMPTY_CALL_DRAFT
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seal = async () => {
    if (busy || !callDraftReady(draft)) return;
    setBusy(true);
    setError(null);
    const call = callPayload(draft);
    if (!call) {
      setBusy(false);
      setError("That draft is not ready to seal yet.");
      return;
    }
    const res = await realmFetch<{ error?: string; post?: Post; id?: string }>(
      "/api/posts",
      {
        method: "POST",
        json: {
          body: draftSentence(draft),
          call,
          visibility: "public",
        },
      }
    );
    setBusy(false);
    if (!res.ok || !res.data?.id) {
      setError(res.data?.error ?? "The Call refused to seal. Try again.");
      return;
    }
    router.push(`/calls/${res.data.id}`);
  };

  if (!authenticated) {
    return (
      <Card className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-bone-mut">
          Sealing a Call needs a signed-in member.
        </p>
        <Button
          variant="gold"
          size="lg"
          render={<Link href="/signin" />}
          className="shrink-0"
        >
          Sign in
        </Button>
      </Card>
    );
  }

  return (
    <ConsoleStack>
      {draft.category !== "realm" && <TrendingPicks onPick={(symbol) => setDraft({ ...draft, token: symbol })} />}

      <CallForm draft={draft} onChange={setDraft} />

      {error && (
        <p role="alert" className="text-xs leading-relaxed text-state-danger">
          {error}
        </p>
      )}

      <Button
        variant="gold"
        size="lg"
        block
        disabled={busy || !callDraftReady(draft)}
        onClick={() => void seal()}
      >
        <Icon name="target" className="h-4 w-4" />
        {busy ? "Sealing..." : "Seal this Call"}
      </Button>

      <p className="text-center text-[11px] leading-relaxed text-bone-faint">
        New to Calls?{" "}
        <Link href="/chronicle#calls" className="text-gold hover:text-gold-bright">
          Read how they work in the Chronicle
        </Link>
        .
      </p>
    </ConsoleStack>
  );
}

export default function NewCallPage() {
  return (
    <ConsolePage width="form">
      <ConsoleHeader
        title="Seal a Call"
        kicker="A public claim, scored against how hard it actually was"
        backHref="/calls"
      />
      <div className="mt-4 md:mt-3">
        <Suspense fallback={null}>
          <NewCallSurface />
        </Suspense>
      </div>
    </ConsolePage>
  );
}
