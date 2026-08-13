"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";

/* THE FAIRNESS PANEL: the two steps, in the order that makes them mean
 * something.
 *
 * Step one, and the realm goes first. It publishes the hash of the seed that
 * will draw the member's next chest, before the member has chosen anything and
 * before the realm knows what they will choose. Step two, the member answers
 * with a client seed of their own, having already seen that hash. Both halves
 * are locked in before either side sees the other's, so the roll is neither
 * party's to pick.
 *
 * Step three happens at the chest: the opening reveals the seed, commits a
 * fresh one, and hands back everything needed to rerun the draw. That is why
 * this screen never asks a member to "remember to rotate": the reveal is
 * automatic and the proof arrives with the cards.
 *
 * Real data only, and here that matters more than usual. Every hash on this
 * page is the member's own live commitment, read from the server. Nothing is
 * illustrative, nothing is an example, and the panel renders an honest signed
 * out state rather than a specimen hash nobody's chest was drawn with.
 */

type Commitment = {
  id: string;
  seed_hash: string;
  client_seed: string;
  created_at: string;
};

type Revealed = Commitment & { seed: string; revealed_at: string };

/* A 64 character hash is unreadable in full on a phone and meaningless
   truncated to six. Both ends, generously, which is what a person actually
   compares when checking one against another. */
function shorten(hash: string): string {
  return hash.length > 26 ? `${hash.slice(0, 12)}…${hash.slice(-10)}` : hash;
}

export function FairnessPanel() {
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [revealed, setRevealed] = useState<Revealed[]>([]);
  const [seedDraft, setSeedDraft] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "signed-out">(
    "loading"
  );
  const showSkeleton = useDelayedLoading(state === "loading", 300);

  const load = useCallback(async () => {
    const res = await realmFetch<{
      commitment?: Commitment;
      revealed?: Revealed[];
      error?: string;
    }>("/api/chests/seed");
    if (res.status === 401) {
      setState("signed-out");
      return;
    }
    if (!res.ok || !res.data?.commitment) {
      setState("signed-out");
      return;
    }
    setCommitment(res.data.commitment);
    setSeedDraft(res.data.commitment.client_seed);
    setRevealed(res.data.revealed ?? []);
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (rotate: boolean) => {
    setState("saving");
    const res = await realmFetch<{ commitment?: Commitment }>("/api/chests/seed", {
      method: "POST",
      json: { client_seed: seedDraft, rotate },
    });
    if (!res.ok) {
      setState("ready");
      return;
    }
    await load();
  };

  if (state === "loading") {
    return showSkeleton ? <Skeleton radius="xl" className="h-48 w-full" /> : null;
  }

  if (state === "signed-out") {
    return (
      <Card>
        <SectionHeader title="How a chest is drawn" />
        <p className="mt-1 text-sm leading-relaxed text-bone-mut">
          Before you open anything, the realm publishes the hash of the seed
          that will draw your next chest. You then choose a seed of your own,
          having already seen it. Neither side can pick to suit the other. Enter
          the realm and your commitment is struck.
        </p>
      </Card>
    );
  }

  const busy = state === "saving";

  return (
    <Card>
      <SectionHeader title="How a chest is drawn" hint="Provably fair" />

      <ol className="mt-2 flex flex-col gap-4">
        <li className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            One &middot; the realm commits
          </p>
          <p className="text-xs leading-relaxed text-bone-mut">
            This is the hash of the secret seed that will draw your next chest.
            It was published before you chose anything, so the realm cannot
            change the seed behind it.
          </p>
          <code className="tnum mt-0.5 block break-all rounded-md border border-steel-line bg-obsidian/60 px-3 py-2 font-mono text-[11px] text-bone">
            {commitment?.seed_hash}
          </code>
        </li>

        <li className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            Two &middot; you answer
          </p>
          <p className="text-xs leading-relaxed text-bone-mut">
            Your own seed goes into the draw beside the realm&rsquo;s. Any text
            you like. The realm cannot know it in advance, so it cannot pick a
            seed to suit it.
          </p>
          {/* Base UI's Field wires the label to the control itself, so no
              manual id pairing. */}
          <Field label="Your seed" disabled={busy}>
            <Input
              value={seedDraft}
              maxLength={64}
              disabled={busy}
              placeholder="Anything at all"
              onChange={(e) => setSeedDraft(e.target.value)}
            />
          </Field>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              variant="gold"
              size="sm"
              disabled={busy || seedDraft === commitment?.client_seed}
              onClick={() => void save(false)}
            >
              {busy ? "Sealing" : "Seal my seed"}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Make the realm commit again
            </Button>
          </div>
        </li>

        <li className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            Three &middot; the chest reveals
          </p>
          <p className="text-xs leading-relaxed text-bone-mut">
            Opening a chest publishes the seed that drew it and commits a fresh
            one for the next. Hash the revealed seed, check it against the hash
            you were shown first, and rerun the draw yourself.
          </p>
          {/* The promise is made on this panel, so the place to keep it is on
              this panel too. Three steps that a member cannot act on are a
              description of a scheme, not a scheme they can hold anyone to. */}
          <Button
            size="sm"
            className="mt-1 self-start"
            render={<Link href="/proof" />}
          >
            <Icon name="shield" className="h-4 w-4" />
            Check a draw yourself
          </Button>
        </li>
      </ol>

      {revealed.length > 0 ? (
        <div className="mt-5 border-t border-hair pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
            Revealed seeds &middot; {revealed.length}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {revealed.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-0.5 rounded-md border border-steel-line bg-obsidian/40 px-3 py-2"
              >
                <span className="tnum break-all font-mono text-[11px] text-bone">
                  {r.seed}
                </span>
                <span className="tnum break-all font-mono text-[10px] text-bone-faint">
                  committed as {shorten(r.seed_hash)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 flex items-start gap-2 border-t border-hair pt-4 text-xs leading-relaxed text-bone-faint">
          <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          {/* Honest, and the honest thing here is that there is nothing yet.
              No specimen seed, no example opening. */}
          No seeds revealed yet. Your first one is published the moment you open
          your first chest.
        </p>
      )}
    </Card>
  );
}
