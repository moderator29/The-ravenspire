"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { SET_ONE, type SetOneCard } from "@/lib/collectibles/set-one";
import { houses } from "@/lib/data/houses";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Icon3D } from "@/components/ui/icon-3d";
import { Modal } from "@/components/ui/modal";
import { RarityChip } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/tabs";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/cx";
import {
  CONSOLE_META,
  ConsoleStack,
} from "@/components/console/console-shell";
import type { HoardCard } from "@/components/collectibles/hoard";
import type { Rarity } from "@/lib/game/champions";

/* THE CRAFTING BENCH: where duplicates stop being nothing.
 *
 * TWO REGISTERS, ON PURPOSE. Choosing what to destroy is Ledger work: dense,
 * flat, quiet, every copy legible, nothing glowing. It is a Console, and it
 * uses the Console's own density. The moment the card comes out is the Forge:
 * one card, gold, a 3D anchor, and nothing to read. That separation is the
 * whole design system in one screen (AGENTS.md rule 21), and it is also just
 * true to the act: burning four cards should feel like accounting, and getting
 * a legendary should not.
 *
 * ONE TILE PER COPY, NOT PER CARD, which is the opposite of the Hoard and the
 * reason the two surfaces cannot be the same component. The Hoard is a trophy
 * case, where forty tiles of one champion is a spreadsheet. Crafting acts on
 * copies: a member burning four rares is choosing four specific rows, and a
 * stacked tile would hide which ones. They share the card face, the rarity
 * frame and the collector number so the two read as one product.
 *
 * THE LAST COPY WARNING. A member may burn their only copy of a card, because
 * it is their card. The bench does not stop them and does not hide the option:
 * it marks the copy, plainly, before they commit. Refusing would be the
 * platform deciding what somebody may do with their own property, which is the
 * opposite of everything else in this realm.
 *
 * REAL DATA ONLY. The ledger is written by chest opening and redemption, both
 * sealed, so nearly every bench is empty today and renders as an honestly empty
 * one. The ratios are real and are printed even while the bench is sealed, for
 * the same reason a chest prints its odds before it can be bought: a member is
 * entitled to read the terms of a trade before the trade exists.
 */

type CraftStep = { from: string; to: string; burn: number };

type RuleResponse = {
  steps?: CraftStep[];
  crafting?: { open: boolean; reason?: string };
};

type HoardResponse = { cards?: HoardCard[] };

type CraftResponse = {
  craft?: {
    id: string;
    from_rarity: string;
    to_rarity: string;
    burned: number;
    forged: {
      set_slug: string;
      card_number: number;
      champion_slug: string;
      rarity: string;
      inventory_id?: string;
    };
  };
  error?: string;
};

const RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

function asRarity(value: string): Rarity | null {
  return RARITIES.has(value) ? (value as Rarity) : null;
}

const sigilByHouse = new Map(houses.map((h) => [h.name, h.sigil] as const));
const CARDS_BY_SLUG = new Map(
  SET_ONE.cards.map((card) => [card.champion.slug, card] as const)
);

/* A copy carrying a live claim is already in the member's own wallet, or on
   its way there, and the realm cannot burn it: they hold the token and the
   ledger row is only the platform's side of a fact the chain also knows. The
   server refuses it too; the bench refuses first so nobody selects four copies
   and learns on the last click. */
function onChain(copy: HoardCard): boolean {
  const status = copy.claim?.status;
  return status === "issued" || status === "submitted" || status === "minted";
}

/* ------------------------------------------------------------------
   The card face, shared with the Hoard's language.
   ------------------------------------------------------------------ */

function CardFace({
  card,
  selected,
  dimmed,
}: {
  card: { champion_slug: string; card_number: number; rarity: string };
  selected?: boolean;
  dimmed?: boolean;
}) {
  const real = CARDS_BY_SLUG.get(card.champion_slug);
  const sigil = sigilByHouse.get(real?.champion.house ?? "") ?? "banner";
  return (
    <span
      className={cx(
        `rarity-${card.rarity} rarity-frame`,
        "relative block aspect-[5/7] w-full overflow-hidden rounded-lg bg-void",
        /* Selection is a transform and an opacity change, nothing else, so it
           stays on the compositor and inside the motion budget. */
        "transition-[transform,opacity] duration-fast ease-out-quint",
        selected && "scale-[0.94] opacity-90",
        dimmed && "opacity-40"
      )}
    >
      {real?.champion.art ? (
        <Image
          src={real.champion.art}
          alt=""
          fill
          sizes="(max-width: 640px) 30vw, (max-width: 1024px) 20vw, 140px"
          className="object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Icon name={sigil} className="h-8 w-8 text-gold/40" />
        </span>
      )}

      <span className="tnum absolute left-1 top-1 rounded-sm bg-obsidian/70 px-1 py-0.5 text-[9px] font-semibold text-bone-faint">
        {card.card_number}
      </span>

      {selected ? (
        /* The mark, gold, because a card chosen for the fire is the one thing
           on this grid that has been decided. */
        <span className="absolute inset-0 flex items-center justify-center bg-obsidian/45">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gold/50 bg-obsidian/80">
            <Icon name="check" className="h-4 w-4 text-gold" />
          </span>
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------
   The bench.
   ------------------------------------------------------------------ */

export function CraftingBench() {
  const [rule, setRule] = useState<RuleResponse | null>(null);
  const [cards, setCards] = useState<HoardCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  /* Kept apart from `failed`, because a Hoard that could not be read is not an
     empty Hoard and must never render as one. The rule is still worth printing
     when only the holdings are missing, so the two failures produce two
     different screens. */
  const [hoardFailed, setHoardFailed] = useState(false);
  const [fromRarity, setFromRarity] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [forged, setForged] = useState<CraftResponse["craft"] | null>(null);

  const showSkeleton = useDelayedLoading(
    (rule === null || cards === null) && !failed,
    300
  );

  const load = useCallback(async () => {
    const [ruleRes, hoardRes] = await Promise.all([
      realmFetch<RuleResponse>("/api/collectibles/craft"),
      realmFetch<HoardResponse>("/api/inventory"),
    ]);
    if (!ruleRes.ok || !ruleRes.data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRule(ruleRes.data);
    const readHoard = hoardRes.ok && hoardRes.data;
    setHoardFailed(!readHoard);
    setCards(readHoard ? (hoardRes.data?.cards ?? []) : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = useMemo(() => rule?.steps ?? [], [rule]);
  const open = rule?.crafting?.open === true;

  /* Copies the member holds at each rarity, and how many of each card, so a
     last copy can be marked. Recomputed from the ledger rather than tracked,
     because the ledger is the only thing that knows. */
  const held = useMemo(() => {
    const byRarity = new Map<string, HoardCard[]>();
    const perCard = new Map<string, number>();
    for (const copy of cards ?? []) {
      const list = byRarity.get(copy.rarity) ?? [];
      list.push(copy);
      byRarity.set(copy.rarity, list);
      const key = `${copy.set_slug}:${copy.champion_slug}`;
      perCard.set(key, (perCard.get(key) ?? 0) + 1);
    }
    return { byRarity, perCard };
  }, [cards]);

  /* The rarity the bench opens on: the first step the member could actually
     work. Landing on "rare" when they hold none of them is a screen that
     reports an absence rather than offering an action. */
  useEffect(() => {
    if (fromRarity !== null || steps.length === 0) return;
    const workable = steps.find(
      (s) => (held.byRarity.get(s.from)?.length ?? 0) >= s.burn
    );
    setFromRarity(workable?.from ?? steps[0].from);
  }, [steps, held, fromRarity]);

  const step = steps.find((s) => s.from === fromRarity) ?? null;

  const pool = useMemo(() => {
    const list = held.byRarity.get(fromRarity ?? "") ?? [];
    /* Collector order, so the grid reads like the printed set rather than like
       the order chests happened to arrive. */
    return [...list].sort((a, b) => a.card_number - b.card_number);
  }, [held, fromRarity]);

  const targets: SetOneCard[] = useMemo(() => {
    if (!step) return [];
    return SET_ONE.cards.filter((c) => c.champion.rarity === step.to);
  }, [step]);

  /* Changing which step you are working abandons a selection made against the
     old one. Silently keeping it would leave epics selected under a rare
     craft, which the server would then refuse for a reason the screen never
     showed. */
  const chooseRarity = useCallback((next: string) => {
    setFromRarity(next);
    setChosen([]);
    setTarget(null);
    setProblem(null);
  }, []);

  const toggle = useCallback(
    (copy: HoardCard) => {
      if (onChain(copy) || !step) return;
      setProblem(null);
      setChosen((current) => {
        if (current.includes(copy.id)) {
          return current.filter((id) => id !== copy.id);
        }
        /* The count is the price, so the bench simply will not take a
           fifth. A member who wants to swap one out deselects it. */
        if (current.length >= step.burn) return current;
        return [...current, copy.id];
      });
    },
    [step]
  );

  const ready = Boolean(step && chosen.length === step.burn && target && open);

  const forge = useCallback(async () => {
    if (!step || !target || busy) return;
    setBusy(true);
    setProblem(null);
    const res = await realmFetch<CraftResponse>("/api/collectibles/craft", {
      method: "POST",
      json: {
        set_slug: SET_ONE.slug,
        from_rarity: step.from,
        target_champion_slug: target,
        burn_ids: chosen,
      },
    });
    setBusy(false);
    if (!res.ok || !res.data?.craft) {
      /* The server's own words. They are written for members, and they are the
         only ones that know why a particular craft was refused. */
      setProblem(res.data?.error ?? "The craft could not be completed");
      return;
    }
    setForged(res.data.craft);
    setChosen([]);
    setTarget(null);
    /* The ledger has changed underneath the grid: four copies are gone and one
       has arrived. Re-read rather than patch, because the ledger is the truth
       and a locally reconciled copy of it is a second answer waiting to be
       wrong. */
    void load();
  }, [step, target, chosen, busy, load]);

  if (failed) {
    return (
      <Card>
        <p className="text-sm text-bone-mut">
          The bench could not be read just now. Try again in a moment.
        </p>
      </Card>
    );
  }

  if (rule === null || cards === null) {
    return showSkeleton ? (
      <ConsoleStack>
        <Skeleton radius="lg" className="h-20" />
        <Skeleton radius="lg" className="h-64" />
      </ConsoleStack>
    ) : null;
  }

  const nothingHeld = (cards?.length ?? 0) === 0;

  return (
    <ConsoleStack>
      <PrintedRule steps={steps} open={open} reason={rule.crafting?.reason} />

      {hoardFailed ? (
        /* Honest, and quiet. Saying "nothing to craft" here would be a claim
           about somebody's collection that the bench has no grounds for. */
        <Card>
          <p className="text-sm text-bone-mut">
            Your Hoard could not be read just now, so there is nothing to lay on
            the bench. The rule above is still the rule. Try again in a moment.
          </p>
        </Card>
      ) : nothingHeld ? (
        <Card pad="none">
          <EmptyState
            icon3d="chest"
            title="Nothing to craft yet"
            body="Crafting burns duplicates you already hold. Warchests are sealed until launch, so nothing has been pulled yet. When the first one opens, every spare copy becomes a step up the ladder."
            action={
              <Button variant="gold" size="lg" render={<Link href="/warchests" />}>
                See the Warchests
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <SegmentedControl
            label="Which rarity to burn"
            items={steps.map((s) => ({
              value: s.from,
              label: `${s.from} (${held.byRarity.get(s.from)?.length ?? 0})`,
            }))}
            value={fromRarity ?? steps[0]?.from ?? ""}
            onValueChange={chooseRarity}
            block
          />

          {/* Desktop puts the fire on the left and the choice of what comes out
              of it on the right, both visible at once, because on a wide screen
              a member is comparing the two. A phone cannot show both without
              shrinking each into uselessness, so it stacks them in the order
              the decision is actually made and carries the action in a bar
              pinned to the thumb. Different layouts, not one scaled. */}
          <div className="grid gap-4 md:gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <BurnGrid
              pool={pool}
              chosen={chosen}
              step={step}
              perCard={held.perCard}
              onToggle={toggle}
            />

            <div className="flex flex-col gap-4 md:gap-3 lg:sticky lg:top-4">
              <TargetPicker
                targets={targets}
                value={target}
                onChange={(slug) => {
                  setTarget(slug);
                  setProblem(null);
                }}
                toRarity={step?.to ?? null}
              />

              {/* The action, in the rail on a desktop. The phone gets its own
                  pinned bar below instead, so the two never both appear. */}
              <div className="hidden lg:block">
                <ForgeAction
                  step={step}
                  chosen={chosen.length}
                  ready={ready}
                  busy={busy}
                  open={open}
                  problem={problem}
                  onForge={() => void forge()}
                />
              </div>
            </div>
          </div>

          <div
            className={cx(
              "sticky bottom-0 z-sticky -mx-3 border-t border-steel-line bg-obsidian/95 px-3 py-3",
              "backdrop-blur-[14px] sm:-mx-4 sm:px-4 lg:hidden"
            )}
          >
            <ForgeAction
              step={step}
              chosen={chosen.length}
              ready={ready}
              busy={busy}
              open={open}
              problem={problem}
              onForge={() => void forge()}
            />
          </div>
        </>
      )}

      <ForgeCeremony craft={forged} onClose={() => setForged(null)} />
    </ConsoleStack>
  );
}

/* ------------------------------------------------------------------
   The printed rule. Ledger register: this is a price list.
   ------------------------------------------------------------------ */

function PrintedRule({
  steps,
  open,
  reason,
}: {
  steps: CraftStep[];
  open: boolean;
  reason?: string;
}) {
  return (
    <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
      <p className={cx(CONSOLE_META, "uppercase tracking-[0.2em] text-bone-faint")}>
        The rule, and it does not change
      </p>
      <dl className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:gap-6">
        {steps.map((step) => {
          const to = asRarity(step.to);
          return (
            <div key={step.from} className="flex items-center gap-2">
              <dt className="tnum text-sm font-semibold text-bone">
                {step.burn} {step.from}
              </dt>
              <dd className="flex items-center gap-1.5 text-xs text-bone-mut">
                make one
                {to ? <RarityChip rarity={to}>{step.to}</RarityChip> : step.to}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-bone-faint">
        A craft destroys the copies it burns. It always costs more than the card
        it forges is worth, and it is never a cheaper way to reach a rarity than
        opening a Warchest. You choose what comes out, so there is no roll here
        and nothing to verify.
      </p>
      {!open ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 text-[11px] font-semibold text-bone-faint">
          <Icon name="lock" className="h-3 w-3 text-gold" />
          {reason ?? "The crafting bench is sealed until launch"}
        </p>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------
   What burns. Ledger register: dense, flat, no ornament.
   ------------------------------------------------------------------ */

function BurnGrid({
  pool,
  chosen,
  step,
  perCard,
  onToggle,
}: {
  pool: HoardCard[];
  chosen: string[];
  step: CraftStep | null;
  perCard: Map<string, number>;
  onToggle: (copy: HoardCard) => void;
}) {
  if (!step) return null;

  if (pool.length === 0) {
    return (
      <Card pad="none">
        <EmptyState
          size="sm"
          icon="layers"
          title={`No ${step.from} cards in your Hoard`}
          body="Nothing at this rarity to burn yet."
        />
      </Card>
    );
  }

  return (
    <Card radius="lg" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-bone">
          Choose {step.burn} to burn
        </p>
        <p className={cx(CONSOLE_META, "tnum text-bone-mut")}>
          {chosen.length} of {step.burn} chosen
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {pool.map((copy) => {
          const selected = chosen.includes(copy.id);
          const locked = onChain(copy);
          const full = chosen.length >= step.burn && !selected;
          const lastCopy =
            (perCard.get(`${copy.set_slug}:${copy.champion_slug}`) ?? 0) === 1;
          return (
            <li key={copy.id}>
              <button
                type="button"
                onClick={() => onToggle(copy)}
                disabled={locked}
                aria-pressed={selected}
                aria-label={`${copy.name ?? copy.champion_slug}, number ${copy.card_number}${
                  lastCopy ? ", your only copy" : ""
                }${locked ? ", already in your wallet" : ""}`}
                className={cx(
                  "touch:min-h-11 touch:min-w-11",
          "flex w-full flex-col gap-1 rounded-lg text-left",
                  "disabled:cursor-not-allowed",
                  full && "opacity-60"
                )}
              >
                <CardFace
                  card={copy}
                  selected={selected}
                  dimmed={locked}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[11px] font-semibold leading-tight text-bone">
                    {copy.name ?? copy.champion_slug}
                  </span>
                  {locked ? (
                    <span className="text-[10px] uppercase tracking-[0.14em] text-gold">
                      In your wallet
                    </span>
                  ) : lastCopy ? (
                    /* Ember, not a refusal. The member may burn their only
                       copy; they simply may not do it without being told. */
                    <span className="text-[10px] uppercase tracking-[0.14em] text-ember">
                      Only copy
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------
   What comes out. Still Ledger: the choice is a list, not a reward.
   ------------------------------------------------------------------ */

function TargetPicker({
  targets,
  value,
  onChange,
  toRarity,
}: {
  targets: SetOneCard[];
  value: string | null;
  onChange: (slug: string) => void;
  toRarity: string | null;
}) {
  if (!toRarity) return null;
  const rarity = asRarity(toRarity);
  return (
    <Card radius="lg" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-bone">What to forge</p>
        {rarity ? <RarityChip rarity={rarity}>{toRarity}</RarityChip> : null}
      </div>

      <ul className="grid max-h-[22rem] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-3">
        {targets.map((card) => {
          const selected = value === card.champion.slug;
          return (
            <li key={card.champion.slug}>
              <button
                type="button"
                onClick={() => onChange(card.champion.slug)}
                aria-pressed={selected}
                aria-label={`Forge ${card.champion.name}, number ${card.number}`}
                className={cx(
                  "touch:min-h-11 touch:min-w-11",
          "flex w-full flex-col gap-1 rounded-lg text-left",
                  "transition-opacity duration-fast ease-out-quint",
                  !selected && value !== null && "opacity-55"
                )}
              >
                <CardFace
                  card={{
                    champion_slug: card.champion.slug,
                    card_number: card.number,
                    rarity: card.champion.rarity,
                  }}
                  selected={selected}
                />
                <span className="truncate text-[10px] font-semibold leading-tight text-bone">
                  {card.champion.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------
   The action.
   ------------------------------------------------------------------ */

function ForgeAction({
  step,
  chosen,
  ready,
  busy,
  open,
  problem,
  onForge,
}: {
  step: CraftStep | null;
  chosen: number;
  ready: boolean;
  busy: boolean;
  open: boolean;
  problem: string | null;
  onForge: () => void;
}) {
  if (!step) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="gold"
        size="lg"
        block
        disabled={!ready || busy}
        onClick={onForge}
      >
        {busy
          ? "Forging"
          : !open
            ? "Sealed until launch"
            : `Burn ${chosen} of ${step.burn} for one ${step.to}`}
      </Button>
      {problem ? (
        <p className="text-xs leading-snug text-state-danger">{problem}</p>
      ) : (
        <p className={cx(CONSOLE_META, "text-bone-faint")}>
          Burning cannot be undone.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   The forge moment. The one place on this screen that glows.
   ------------------------------------------------------------------ */

function ForgeCeremony({
  craft,
  onClose,
}: {
  craft: CraftResponse["craft"] | null;
  onClose: () => void;
}) {
  const card = craft ? CARDS_BY_SLUG.get(craft.forged.champion_slug) : null;
  const rarity = craft ? asRarity(craft.forged.rarity) : null;

  return (
    <Modal
      open={Boolean(craft)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="sm"
      title="Out of the fire"
      description={
        craft
          ? `${craft.burned} ${craft.from_rarity} cards are gone. This is what they became.`
          : undefined
      }
      footer={
        <Button variant="gold" onClick={onClose}>
          Back to the bench
        </Button>
      }
    >
      {craft ? (
        <div className="flex flex-col items-center gap-4 py-2">
          <Icon3D name="forge" size="lg" />

          <div className="w-40">
            <CardFace
              card={{
                champion_slug: craft.forged.champion_slug,
                card_number: craft.forged.card_number,
                rarity: craft.forged.rarity,
              }}
            />
          </div>

          <div className="flex flex-col items-center gap-1.5 text-center">
            <p className="gold-text font-display text-lg font-semibold">
              {card?.champion.name ?? craft.forged.champion_slug}
            </p>
            {card?.champion.title ? (
              <p className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                {card.champion.title}
              </p>
            ) : null}
            {rarity ? (
              <RarityChip rarity={rarity}>{craft.forged.rarity}</RarityChip>
            ) : null}
          </div>

          <p className="text-center text-xs leading-relaxed text-bone-mut">
            It is in your Hoard, and it is yours to carry to your own wallet
            whenever the mint opens.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
