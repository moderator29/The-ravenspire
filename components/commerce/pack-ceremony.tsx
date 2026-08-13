"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { realmFetch } from "@/lib/auth/api";
import { champions } from "@/lib/game/champions";
import type { ChestTier } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";
import {
  verifyOpening,
  type Proof,
  type RevealedCard,
  type VerifyResult,
} from "@/lib/collectibles/opening-proof";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import {
  ChampionCardFace,
  type ChampionCardSubject,
} from "@/components/ui/champion-card";
import { CopyButton } from "@/components/wallet/copy-button";
import { cx } from "@/components/ui/cx";

/* The pack-opening Ceremony (design law: the Ceremony archetype, the Forge
 * register undiluted). This is the single best moment in the product, so it is
 * the one place gold, glow, the 3D icon and heavy motion are all permitted at
 * once. The reveal beats stay fast (each card lands in well under 300ms, the
 * Ceremony register's licence to run to a full second spent only on the stagger
 * across the whole hand), and everything degrades to a crossfade under
 * prefers-reduced-motion.
 *
 * It calls POST /api/chests/[sku]/open, which is server-authoritative: the
 * client is told what it pulled, never asked. The member may contribute a
 * client seed before opening, which is what proves the server did not precompute
 * a favourable result. After the reveal, "Verify this pull" surfaces the full
 * proof and reproduces the draw in the member's own browser, taking nothing on
 * trust.
 *
 * Sealed posture: while chests_live is off the open route answers 423, and this
 * surfaces that honestly ("sealed until launch") rather than pretending to open.
 */

interface PulledCard {
  number: number;
  slug: string;
  name: string;
  rarity: "rare" | "epic" | "legendary" | "mythic";
}

interface OpenResponse {
  opened?: boolean;
  cards?: PulledCard[];
  proof?: Proof;
  error?: string;
}

type Phase = "intro" | "opening" | "revealed" | "error";

const bySlug = new Map(champions.map((c) => [c.slug, c] as const));

export function PackCeremony({
  tier,
  open,
  onClose,
  onOpened,
}: {
  tier: ChestTier;
  open: boolean;
  onClose: () => void;
  /* Fired after a successful open, so a caller can refresh holdings or orders. */
  onOpened?: () => void;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("intro");
  const [clientSeed, setClientSeed] = useState("");
  const [cards, setCards] = useState<PulledCard[]>([]);
  const [proof, setProof] = useState<Proof | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  function reset() {
    setPhase("intro");
    setClientSeed("");
    setCards([]);
    setProof(null);
    setError(null);
    setVerifyOpen(false);
    setVerifying(false);
    setVerifyResult(null);
  }

  function close() {
    onClose();
    /* Let the exit transition run before wiping the contents. */
    window.setTimeout(reset, 200);
  }

  async function openChest() {
    if (phase === "opening") return;
    setPhase("opening");
    setError(null);
    const res = await realmFetch<OpenResponse>(
      `/api/chests/${encodeURIComponent(tier.sku)}/open`,
      { method: "POST", json: { clientSeed: clientSeed.trim() || undefined } }
    );
    if (res.ok && res.data?.opened && res.data.cards && res.data.proof) {
      setCards(res.data.cards);
      setProof(res.data.proof);
      setPhase("revealed");
      onOpened?.();
      return;
    }
    /* Honest, specific failures straight from the route. */
    const map: Record<number, string> = {
      401: "Enter the realm to open a chest.",
      403: "You have no unopened chest of this kind.",
      409: "This chest opens by its printed code, not here.",
      423: "The chests are sealed until launch.",
      429: "Too many opens too quickly. Give it a moment.",
    };
    setError(
      map[res.status] ??
        res.data?.error ??
        "The chest would not open. Try again."
    );
    setPhase("error");
  }

  async function runVerify() {
    if (!proof) return;
    setVerifying(true);
    const revealed: RevealedCard[] = cards.map((c) => ({
      number: c.number,
      slug: c.slug,
      rarity: c.rarity,
    }));
    const result = await verifyOpening(tier, proof, revealed);
    setVerifyResult(result);
    setVerifying(false);
  }

  const hand = useMemo(
    () =>
      cards.map((c) => {
        const champ = bySlug.get(c.slug);
        return {
          key: `${c.number}-${c.slug}`,
          number: c.number,
          rarity: c.rarity,
          champion: champ ?? {
            slug: c.slug,
            name: c.name,
            title: "",
            house: "",
            rarity: c.rarity,
            art: null,
          },
        };
      }),
    [cards]
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-overlay bg-obsidian/88 backdrop-blur-sm transition-opacity duration-base ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast" />
        <Dialog.Viewport className="fixed inset-0 z-modal flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <Dialog.Popup
            aria-label={`Open the ${tier.name}`}
            className="my-auto w-full max-w-lg transition-opacity duration-base ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast"
          >
            <Card
              pad="none"
              radius="2xl"
              elevation="overlay"
              tone="gold"
              className="relative w-full overflow-hidden p-6 sm:p-7"
            >
              {/* Atmosphere sits behind the plate, never on it. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(60% 45% at 50% 30%, rgba(217,176,64,0.20), transparent 70%)",
                }}
              />

              <div className="relative flex flex-col items-center text-center">
                <Dialog.Close
                  className="absolute -right-1 -top-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-bone-faint transition-colors duration-fast hover:text-bone"
                  aria-label="Close"
                >
                  <Icon name="close" className="h-4 w-4" />
                </Dialog.Close>

                {(phase === "intro" ||
                  phase === "opening" ||
                  phase === "error") && (
                  <IntroFace
                    tier={tier}
                    phase={phase}
                    reduced={Boolean(reduced)}
                    clientSeed={clientSeed}
                    setClientSeed={setClientSeed}
                    error={error}
                    onOpen={openChest}
                  />
                )}

                {phase === "revealed" && proof && (
                  <RevealFace
                    tier={tier}
                    hand={hand}
                    reduced={Boolean(reduced)}
                    proof={proof}
                    clientSeed={proof.clientSeed}
                    verifyOpen={verifyOpen}
                    setVerifyOpen={setVerifyOpen}
                    verifying={verifying}
                    verifyResult={verifyResult}
                    onVerify={runVerify}
                    onDone={close}
                  />
                )}
              </div>
            </Card>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function IntroFace({
  tier,
  phase,
  reduced,
  clientSeed,
  setClientSeed,
  error,
  onOpen,
}: {
  tier: ChestTier;
  phase: Phase;
  reduced: boolean;
  clientSeed: string;
  setClientSeed: (v: string) => void;
  error: string | null;
  onOpen: () => void;
}) {
  const opening = phase === "opening";
  return (
    <div className="flex flex-col items-center">
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.7, rotate: -6 }}
        animate={
          opening
            ? reduced
              ? {}
              : { scale: [1, 1.06, 1], rotate: [0, -3, 3, 0] }
            : reduced
              ? {}
              : { opacity: 1, scale: 1, rotate: 0 }
        }
        transition={
          opening
            ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", visualDuration: 0.6, bounce: 0.34 }
        }
      >
        {/* The real chest: closed at rest, the gold-burst open art while it
            draws. Sits on obsidian so the art's dark ground blends in. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={opening ? tier.art.open : tier.art.closed}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-40 w-auto max-w-full object-contain"
          style={{ filter: "drop-shadow(0 10px 28px rgba(0,0,0,0.6))" }}
        />
      </motion.div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
        {tier.plain}
      </p>
      <h2 className="gold-text mt-2 font-display text-2xl font-semibold tracking-wide">
        {tier.name}
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-bone-mut">
        {opening
          ? "Drawing your cards against the printed odds."
          : "Every pull is drawn on the server against the odds printed on this chest, and every draw is yours to verify afterward."}
      </p>

      {!opening && (
        <div className="mt-5 w-full max-w-xs text-left">
          <Field
            label="Your seed (optional)"
            description="Add anything you like. It is mixed into the draw so the outcome cannot have been chosen for you."
          >
            <Input
              value={clientSeed}
              onChange={(e) => setClientSeed(e.target.value.slice(0, 128))}
              placeholder="e.g. a lucky word"
              className="h-9"
            />
          </Field>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-2 text-xs text-state-danger"
        >
          <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <Button
        variant="gold"
        size="lg"
        block
        className="mt-6 max-w-xs"
        loading={opening}
        onClick={onOpen}
      >
        {opening ? "Opening" : error ? "Try again" : "Open the chest"}
      </Button>
    </div>
  );
}

interface HandCard {
  key: string;
  number: number;
  rarity: "rare" | "epic" | "legendary" | "mythic";
  champion: ChampionCardSubject;
}

function RevealFace({
  tier,
  hand,
  reduced,
  proof,
  clientSeed,
  verifyOpen,
  setVerifyOpen,
  verifying,
  verifyResult,
  onVerify,
  onDone,
}: {
  tier: ChestTier;
  hand: HandCard[];
  reduced: boolean;
  proof: Proof;
  clientSeed: string;
  verifyOpen: boolean;
  setVerifyOpen: (v: boolean) => void;
  verifying: boolean;
  verifyResult: VerifyResult | null;
  onVerify: () => void;
  onDone: () => void;
}) {
  /* The best card in the hand, for the eyebrow. */
  const best = hand.reduce((a, b) => {
    const order = ["rare", "epic", "legendary", "mythic"];
    return order.indexOf(b.rarity) > order.indexOf(a.rarity) ? b : a;
  }, hand[0]);

  return (
    <div className="flex w-full flex-col items-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
        {tier.name} opened
      </p>
      <h2 className="gold-text mt-1.5 font-display text-xl font-semibold tracking-wide">
        {best?.rarity === "mythic" || best?.rarity === "legendary"
          ? "A rare pull"
          : "Your cards"}
      </h2>

      <div
        className={cx(
          "mt-5 grid w-full gap-2.5",
          hand.length <= 3
            ? "grid-cols-3"
            : hand.length <= 5
              ? "grid-cols-3 sm:grid-cols-5"
              : "grid-cols-3 sm:grid-cols-5"
        )}
      >
        {hand.map((c, i) => (
          <motion.div
            key={c.key}
            initial={
              reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 14 }
            }
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            transition={
              reduced
                ? { duration: 0.15, delay: i * 0.04 }
                : {
                    type: "spring",
                    visualDuration: 0.24,
                    bounce: 0.3,
                    delay: 0.08 + i * 0.09,
                  }
            }
          >
            <ChampionCardFace
              champion={c.champion}
              number={c.number}
              total={SET_ONE.counts.total}
              size="sm"
            />
          </motion.div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-bone-mut">
        These cards are now yours, held non-custodially in your own binder.
      </p>

      {/* Verify this pull. A real, in-browser confirmation: it re-hashes the
          revealed seed against the commitment and reproduces the draw. */}
      <div className="mt-5 w-full">
        <button
          type="button"
          aria-expanded={verifyOpen}
          onClick={() => {
            const next = !verifyOpen;
            setVerifyOpen(next);
            if (next && !verifyResult && !verifying) onVerify();
          }}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-steel-line bg-obsidian/50 px-3 py-2.5 text-left text-xs font-semibold text-bone-mut transition-colors duration-fast hover:text-bone touch:min-h-11"
        >
          <span className="flex items-center gap-2">
            <Icon name="shield" className="h-3.5 w-3.5 text-gold" />
            Verify this pull
          </span>
          <Icon
            name="chevron-down"
            className={cx(
              "h-4 w-4 shrink-0 transition-transform duration-fast",
              verifyOpen && "rotate-180"
            )}
          />
        </button>

        {verifyOpen && (
          <div className="mt-2 flex flex-col gap-2.5 rounded-md border border-steel-line bg-obsidian/40 p-3 text-left">
            {verifying ? (
              <p className="text-xs text-bone-faint">Reproducing the draw...</p>
            ) : verifyResult ? (
              <div className="flex flex-col gap-1.5">
                <VerifyLine
                  ok={verifyResult.hashOk}
                  label="Commitment matches"
                  detail="sha256(server seed) equals the hash shown before the pull"
                />
                <VerifyLine
                  ok={verifyResult.drawOk}
                  label="Draw reproduced"
                  detail="the same seeds replay to exactly these cards"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-steel-line pt-2.5">
              <ProofRow label="Server seed" value={proof.serverSeed} mono />
              <ProofRow
                label="Server seed hash"
                value={proof.serverSeedHash}
                mono
              />
              <ProofRow
                label="Your seed"
                value={clientSeed || "(none)"}
                mono={Boolean(clientSeed)}
              />
              <ProofRow label="Nonce" value={String(proof.nonce)} mono />
            </div>
          </div>
        )}
      </div>

      <Button variant="gold" size="lg" block className="mt-5" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function VerifyLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={cx(
          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
          ok
            ? "border-gold/50 bg-gold/10 text-gold"
            : "border-state-danger/50 bg-state-danger/10 text-state-danger"
        )}
      >
        <Icon name={ok ? "check" : "close"} className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-bone">{label}</span>
        <span className="block text-[11px] leading-snug text-bone-faint">
          {detail}
        </span>
      </span>
    </div>
  );
}

function ProofRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
          {label}
        </p>
        <p
          className={cx(
            "mt-0.5 break-all text-[11px] text-bone-mut",
            mono && "tnum font-mono"
          )}
        >
          {value}
        </p>
      </div>
      {value && value !== "(none)" ? (
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} iconOnly />
      ) : null}
    </div>
  );
}
