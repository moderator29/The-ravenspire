"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "framer-motion";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import type { Rarity } from "@/lib/game/champions";
import { SET_ONE } from "@/lib/collectibles/set-one";
import { houses } from "@/lib/data/houses";

/* THE OPENING. The Forge register, undiluted, and the one screen in the
 * collectibles realm anybody will describe to a friend.
 *
 * It is deliberately not the `Ceremony` primitive. That component carries one
 * sentence, one number and one action by design, and says so; a chest carries
 * three to ten cards and a cryptographic proof, which is a different shape. So
 * this is a Ceremony by archetype, full bleed and motion led, without
 * pretending to be that component.
 *
 * ON BASE UI DIALOG, and the first draft of this file was not, which was a
 * mistake this codebase has already paid for once. A hand rolled
 * `createPortal` into a `fixed inset-0` div satisfies house rule 16 on the
 * letter (it does portal to document.body) and fails everything that rule is
 * actually for: focus never enters the overlay, Escape does nothing, the
 * background keeps scrolling, and Tab walks straight out into the page
 * underneath. The Ceremony component carries a comment recording exactly that
 * measurement, 22 of 24 focusable elements reachable outside the dialog, which
 * is precisely why writing a twentieth bespoke overlay was the wrong move.
 * Base UI supplies focus entry, focus restore on close, the Escape handler and
 * the scroll lock; `components/shell/inert-background.tsx`, mounted in the
 * shell, closes the keyboard half.
 *
 * WHAT IT SHOWS, AND THE ORDER MATTERS. The cards land one at a time, rarest
 * last, because a reveal that shows everything at once has no reveal in it. A
 * card the printed guarantee lifted is marked as such: a floor that fires
 * silently is a floor nobody can audit. Then the proof, because the promise
 * this product makes about chests is not "trust us" and the moment to make
 * good on that is the moment the cards appear, not a settings page nobody
 * visits.
 *
 * ABSENT, NOT DISABLED. A member with no unopened chest of this tier sees
 * nothing at all here. A control that cannot do anything is a promise the
 * screen cannot keep, and every other sealed surface in this realm follows the
 * same rule.
 *
 * Motion: the documented exception to the sub-300ms law. A reward may take a
 * beat. Transform and opacity only, and under prefers-reduced-motion the cards
 * cross-fade in place rather than vanishing, because the moment still matters.
 */

type PulledCard = {
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  guaranteed?: boolean;
};

type Proof = {
  server_seed_hash: string;
  server_seed?: string;
  client_seed: string;
  nonce: string;
};

type OpeningResponse = {
  opening?: { id: string; chest_sku: string; cards?: PulledCard[]; proof?: Proof };
  next_commitment?: { seed_hash: string };
  error?: string;
};

const RARITY_ORDER: Record<string, number> = {
  rare: 0,
  epic: 1,
  legendary: 2,
  mythic: 3,
};

const RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

/* The card's real data, from the roster, which is the single source of truth
   for every card in the realm. The opening response carries a champion slug and
   nothing decorative, deliberately: a name or an art path sent from the server
   would be a second copy of something the client already holds, and the two
   would eventually disagree. Twenty of the forty portraits exist today, so a
   card without one shows its House sigil rather than a broken image. */
const CARDS_BY_SLUG = new Map(
  SET_ONE.cards.map((card) => [card.champion.slug, card] as const)
);
const SIGIL_BY_HOUSE = new Map(houses.map((h) => [h.name, h.sigil] as const));

export function OpenChest({ sku, name }: { sku: string; name: string }) {
  const [unopened, setUnopened] = useState(0);
  const [phase, setPhase] = useState<"idle" | "opening" | "revealed">("idle");
  const [cards, setCards] = useState<PulledCard[]>([]);
  const [proof, setProof] = useState<Proof | null>(null);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadEntitlements = useCallback(async () => {
    const res = await realmFetch<{ unopened?: Record<string, number> }>(
      "/api/chests/entitlements"
    );
    setUnopened(res.data?.unopened?.[sku] ?? 0);
  }, [sku]);

  useEffect(() => {
    void loadEntitlements();
  }, [loadEntitlements]);

  /* The cards arrive together and are shown one at a time. A timer per card
     rather than a stagger on one animation, so the count is visible in the
     state and the reveal can be skipped without unwinding anything. */
  useEffect(() => {
    if (phase !== "revealed" || shown >= cards.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), reduced ? 120 : 420);
    return () => clearTimeout(t);
  }, [phase, shown, cards.length, reduced]);

  const open = async () => {
    setPhase("opening");
    setError(null);
    const res = await realmFetch<OpeningResponse>(`/api/chests/${sku}/open`, {
      method: "POST",
    });
    if (!res.ok || !res.data?.opening?.cards) {
      setPhase("idle");
      setError(res.data?.error ?? "The chest could not be opened");
      return;
    }
    /* Rarest last. The server rolls in its own order and the guarantee lands
       in the final slot; sorting for the reveal is presentation and changes
       nothing about what was drawn. */
    const drawn = [...res.data.opening.cards].sort(
      (a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0)
    );
    setCards(drawn);
    setProof(res.data.opening.proof ?? null);
    setShown(0);
    setPhase("revealed");
    void loadEntitlements();
  };

  const close = () => {
    setPhase("idle");
    setCards([]);
    setProof(null);
    setShown(0);
  };

  /* No chest, no control. */
  if (unopened === 0 && phase === "idle") {
    return error ? (
      <p className="text-[11px] leading-snug text-state-danger">{error}</p>
    ) : null;
  }

  const reveal = mounted ? (
    <Dialog.Root
      open={phase === "revealed"}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-overlay bg-obsidian/90 backdrop-blur-sm transition-opacity duration-base ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast" />
        <Dialog.Viewport className="fixed inset-0 z-modal overflow-y-auto px-4 py-8">
          <Dialog.Popup
            aria-label={`${name}, opened`}
            className="mx-auto w-full max-w-3xl transition-opacity duration-base ease-out-quint data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast"
          >
            <div className="flex w-full flex-col items-center gap-6">
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
                  {name} &middot; opened
                </p>
                <h2 className="gold-text mt-1.5 font-display text-2xl font-semibold sm:text-3xl">
                  {shown >= cards.length
                    ? "Yours, and on the record"
                    : "The chest gives up its cards"}
                </h2>
              </div>

              <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {cards.slice(0, shown).map((card, i) => {
                  const known = CARDS_BY_SLUG.get(card.champion_slug);
                  const art = known?.champion.art ?? null;
                  const sigil =
                    SIGIL_BY_HOUSE.get(known?.champion.house ?? "") ?? "banner";
                  return (
                  <motion.li
                    key={`${card.champion_slug}-${i}`}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "scale(0.92)" }}
                    animate={{ opacity: 1, transform: "scale(1)" }}
                    transition={{ duration: reduced ? 0.15 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col gap-2"
                  >
                    <div
                      className={`rarity-${card.rarity} rarity-frame relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-void`}
                    >
                      {art ? (
                        <Image
                          src={art}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 45vw, 200px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                          <Icon name={sigil} className="h-8 w-8 text-gold/40" />
                          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
                            Portrait incoming
                          </span>
                        </div>
                      )}
                      <span className="tnum absolute left-1.5 top-1.5 rounded-sm bg-obsidian/70 px-1.5 py-0.5 text-[9px] font-semibold text-bone-faint">
                        {card.card_number}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 px-0.5">
                      <span className="truncate font-display text-[13px] font-semibold leading-tight text-bone">
                        {known?.champion.name ?? card.champion_slug}
                      </span>
                      {RARITIES.has(card.rarity) ? (
                        <RarityChip rarity={card.rarity as Rarity}>
                          {card.rarity}
                        </RarityChip>
                      ) : null}
                      {card.guaranteed ? (
                        /* The floor, named where it fired. */
                        <span className="text-[10px] uppercase tracking-[0.14em] text-gold">
                          The guarantee
                        </span>
                      ) : null}
                    </div>
                  </motion.li>
                  );
                })}
              </ul>

              {shown >= cards.length ? (
                <>
                  {proof?.server_seed ? (
                    <div className="w-full rounded-lg border border-steel-line bg-void/60 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
                        Check this draw yourself
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-bone-mut">
                        The realm published the hash below before these cards
                        were drawn. Hash the revealed seed and compare: they
                        match, and the draw was fixed before either side could
                        see the other&rsquo;s half.
                      </p>
                      <dl className="mt-3 flex flex-col gap-2">
                        {[
                          ["Committed hash", proof.server_seed_hash],
                          ["Revealed seed", proof.server_seed],
                          ["Your seed", proof.client_seed || "(none set)"],
                          ["Draw reference", proof.nonce],
                        ].map(([label, value]) => (
                          <div key={label} className="flex flex-col gap-0.5">
                            <dt className="text-[10px] uppercase tracking-[0.18em] text-bone-faint">
                              {label}
                            </dt>
                            <dd className="tnum break-all font-mono text-[11px] text-bone">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="gold" size="lg" onClick={close}>
                      To the Hoard
                    </Button>
                    {unopened > 0 ? (
                      <Button size="lg" onClick={() => void open()}>
                        Open another
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <Button size="sm" onClick={() => setShown(cards.length)}>
                  Show them all
                </Button>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  ) : null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Button
          variant="gold"
          size="md"
          disabled={phase === "opening"}
          onClick={() => void open()}
        >
          <Icon name="lock" className="h-4 w-4" />
          {phase === "opening"
            ? "Opening"
            : unopened > 1
              ? `Open a chest (${unopened})`
              : "Open your chest"}
        </Button>
        {error ? (
          <p className="text-[11px] leading-snug text-state-danger">{error}</p>
        ) : null}
      </div>
      {reveal}
    </>
  );
}
