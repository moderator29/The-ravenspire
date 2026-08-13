"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { houses } from "@/lib/data/houses";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import type { Rarity } from "@/lib/game/champions";
import { ClaimButton } from "@/components/collectibles/claim-button";
import { ListButton, type ListTerms } from "@/components/market/list-button";
import { formatMoney, money } from "@/lib/commerce/money";

/* THE HOARD: the trophy case.
 *
 * The Show beat. Everything else in the collectibles realm is a loop a member
 * runs alone; this is the one surface built to be looked at. It renders on the
 * Keep, on a public Keep, and in the Vault, from the same component, because a
 * trophy case that looks different on a friend's Keep is two trophy cases and
 * the second one is the one nobody tests.
 *
 * REGISTER. A card you own earns the Forge: the art unsealed, the rarity frame
 * and its light, gold on the on-chain chip. The Reliquary's sealed preview is
 * the exact opposite treatment of the same card, and the difference between
 * the two is the whole feeling of owning one (AGENTS.md rule 21). Nothing here
 * glows for a card nobody holds, because nothing here shows a card nobody
 * holds.
 *
 * ONE TILE PER CARD, NOT PER COPY. Duplicates are real and the count is shown,
 * but forty tiles of the same champion is a spreadsheet, not a collection. The
 * claim control acts on the first copy that has no live claim, so the member
 * carries their duplicates on-chain one at a time without ever choosing
 * between two identical rows.
 *
 * REAL DATA ONLY. The ledger is written by chest opening and redemption, both
 * sealed, so almost every Hoard is empty today and renders as an honestly
 * empty one. No starter card, no sample, no preview holding.
 */

export interface HoardClaim {
  id: string | null;
  status: string;
  tx_hash: string | null;
  token_id: string | null;
}

export interface HoardListing {
  id: string;
  status: string;
  price_minor: number;
}

export interface HoardCard {
  id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  source: string;
  acquired_at: string;
  name: string | null;
  title: string | null;
  house: string | null;
  art: string | null;
  claim: HoardClaim | null;
  listing: HoardListing | null;
}

export interface HoardSummary {
  copies: number;
  distinct: number;
  setSize: number;
  byRarity: Record<string, number>;
  minted: number;
  listed: number;
}

export interface MintState {
  open: boolean;
  explorer?: string;
  reason?: string;
}

/* The craft rule, as the trophy case reads it. Ratios only: the per rarity
   floor they are derived from is server only and is not a number any customer
   surface renders. Present on your own Hoard and absent on somebody else's,
   because there is nothing here a visitor can act on. */
export interface CraftState {
  open: boolean;
  steps: { from: string; to: string; burn: number }[];
}

/* The Bazaar's terms, as the trophy case reads them. The fee and the price
   bounds, so a listing control can show a member exactly what a sale pays
   before they commit to one. Present on your own Hoard and absent on somebody
   else's, because there is nothing here a visitor can act on. Never a floor
   value: the per rarity floor is what the platform stands behind, not a market
   price, and the case does not quote it as one. */
export interface MarketState extends ListTerms {
  open: boolean;
}

const sigilByHouse = new Map(houses.map((h) => [h.name, h.sigil] as const));

/* The ledger's rarity is a text column, constrained in the database to the
   four rungs of the ladder. That constraint is not visible to TypeScript, and
   widening it with a cast would hide the one case worth handling: a row whose
   rarity is something this build does not know about. It renders as plain text
   rather than as a chip in a colour picked at random. */
const RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

function asRarity(value: string): Rarity | null {
  return RARITIES.has(value) ? (value as Rarity) : null;
}

const RARITY_ORDER: Record<string, number> = {
  mythic: 0,
  legendary: 1,
  epic: 2,
  rare: 3,
};

type Stack = {
  key: string;
  card: HoardCard;
  copies: HoardCard[];
  minted: number;
  listed: number;
};

/* A copy with a live claim is in the member's own wallet, or on its way there.
   The realm cannot sell it for them: they hold the token, the platform never
   had custody of it, and moving a ledger row on payment would sell a buyer
   something the realm cannot deliver. The server refuses it too; the tile
   refuses first so nobody opens a listing sheet and learns on the last tap. */
function onChain(copy: HoardCard): boolean {
  const status = copy.claim?.status;
  return status === "issued" || status === "submitted" || status === "minted";
}

/* Group the copies into one tile per card, rarest first, then by collector
   number so the case reads like the printed set rather than like the order
   things happened to arrive. */
function stack(cards: HoardCard[]): Stack[] {
  const byCard = new Map<string, Stack>();
  for (const copy of cards) {
    const key = `${copy.set_slug}:${copy.champion_slug}`;
    const existing = byCard.get(key);
    if (existing) {
      existing.copies.push(copy);
      if (copy.claim?.status === "minted") existing.minted += 1;
      if (copy.listing) existing.listed += 1;
    } else {
      byCard.set(key, {
        key,
        card: copy,
        copies: [copy],
        minted: copy.claim?.status === "minted" ? 1 : 0,
        listed: copy.listing ? 1 : 0,
      });
    }
  }
  return [...byCard.values()].sort((a, b) => {
    const rarity =
      (RARITY_ORDER[a.card.rarity] ?? 9) - (RARITY_ORDER[b.card.rarity] ?? 9);
    if (rarity !== 0) return rarity;
    return a.card.card_number - b.card.card_number;
  });
}

function CardFace({ card, copies }: { card: HoardCard; copies: number }) {
  const sigil = sigilByHouse.get(card.house ?? "") ?? "banner";
  return (
    <div
      className={`rarity-${card.rarity} rarity-frame relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-void`}
    >
      {card.art ? (
        <Image
          src={card.art}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px"
          className="object-cover"
        />
      ) : (
        /* The card back, house sigil on obsidian. Honest about a portrait
           that has not landed rather than faking one. */
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[image:radial-gradient(80%_60%_at_50%_35%,rgba(217,176,64,0.08),transparent_70%)]">
          <Icon name={sigil} className="h-10 w-10 text-gold/40" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-bone-faint">
            Portrait incoming
          </span>
        </div>
      )}

      {/* The collector number, the way a printed card carries it. */}
      <span className="tnum absolute left-1.5 top-1.5 rounded-sm bg-obsidian/70 px-1.5 py-0.5 text-[9px] font-semibold text-bone-faint">
        {card.card_number}
      </span>

      {/* Duplicates, only when there are some. A lone copy needs no badge. */}
      {copies > 1 ? (
        <span className="tnum absolute right-1.5 top-1.5 rounded-sm bg-obsidian/70 px-1.5 py-0.5 text-[9px] font-semibold text-bone">
          {copies} copies
        </span>
      ) : null}
    </div>
  );
}

function HoardTile({
  stack: entry,
  own,
  mint,
  market,
  onClaimed,
  onListed,
}: {
  stack: Stack;
  own: boolean;
  mint: MintState | null;
  market: MarketState | null;
  onClaimed?: () => void;
  onListed?: () => void;
}) {
  const { card, copies, minted, listed } = entry;
  /* The first copy with nothing outstanding on it. A copy with an issued or
     submitted claim is already spoken for, and a minted one is done. A copy on
     the Bazaar is spoken for too: a listed card cannot be carried on-chain, or
     a seller could mint it after somebody had already paid for it. */
  const claimable = copies.find(
    (copy) =>
      !copy.listing &&
      (!copy.claim ||
        copy.claim.status === "expired" ||
        copy.claim.status === "void")
  );

  /* The first copy that is free to sell: not already on the board, and not in
     the member's own wallet. Acting on the first free copy is the same rule
     the claim control uses, so a member with four of one card never has to
     choose between four identical rows. */
  const sellable = copies.find((copy) => !copy.listing && !onChain(copy));

  /* The price of the copy actually on the board, when there is exactly one, so
     a seller can see what they asked without leaving the case. Absent when
     several copies of one card are listed at different prices, because a
     single figure would then be picking one of them arbitrarily. */
  const listedCopies = copies.filter((copy) => copy.listing);
  const listedPrice =
    listedCopies.length === 1 ? listedCopies[0].listing?.price_minor ?? null : null;

  return (
    <li className="flex flex-col gap-2">
      <CardFace card={card} copies={copies.length} />
      <div className="flex min-w-0 flex-col gap-1 px-0.5">
        <span className="truncate font-display text-[13px] font-semibold leading-tight text-bone">
          {card.name ?? card.champion_slug}
        </span>
        {card.title ? (
          <span className="truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
            {card.title}
          </span>
        ) : null}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {asRarity(card.rarity) ? (
            <RarityChip rarity={asRarity(card.rarity) as Rarity}>
              {card.rarity}
            </RarityChip>
          ) : (
            <span className="text-[10px] uppercase tracking-[0.14em] text-bone-faint">
              {card.rarity}
            </span>
          )}
          {minted > 0 ? (
            /* The proof, and the only gold on a tile. A card in the member's
               own wallet is the strongest thing this case can say. */
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
              {minted === copies.length ? "In your wallet" : `${minted} on-chain`}
            </span>
          ) : null}
          {listed > 0 ? (
            /* Steel, not gold. A card on the board is a fact about what a
               member is doing with it, not an achievement, and the design
               system reserves the tile's gold for the on-chain proof. */
            <span className="text-[10px] uppercase tracking-[0.14em] text-bone-mut">
              {listedPrice !== null
                ? `Listed at ${formatMoney(money(listedPrice))}`
                : `${listed} listed`}
            </span>
          ) : null}
        </span>
      </div>

      {/* The two controls, on your own case only, and each absent rather than
          present and disabled while its chapter is sealed. A dead control is a
          promise the screen cannot keep. */}
      {own && mint?.open && claimable ? (
        <ClaimButton
          subject={{ kind: "card", inventoryId: claimable.id }}
          label={copies.length > 1 ? "Claim one" : "Claim to your wallet"}
          onClaimed={onClaimed}
        />
      ) : null}

      {own && market?.open && sellable ? (
        <ListButton
          copy={{
            id: sellable.id,
            name: card.name ?? card.champion_slug,
            cardNumber: sellable.card_number,
            rarity: sellable.rarity,
          }}
          terms={market}
          label={copies.length > 1 ? "Sell one" : "Sell on the Bazaar"}
          onListed={onListed}
        />
      ) : null}
    </li>
  );
}

export function Hoard({
  cards,
  summary,
  own,
  mint = null,
  craft = null,
  market = null,
  sealed = false,
  onClaimed,
  onListed,
}: {
  cards: HoardCard[];
  summary: HoardSummary;
  /* The viewer is the keeper. Decides whether anything here can be acted on. */
  own: boolean;
  mint?: MintState | null;
  craft?: CraftState | null;
  market?: MarketState | null;
  /* The member keeps their collection private. A real state, not an error. */
  sealed?: boolean;
  onClaimed?: () => void;
  onListed?: () => void;
}) {
  const stacks = useMemo(() => stack(cards), [cards]);

  /* Whether this collection actually holds enough of one rarity to craft with.
     Computed from the real holdings against the real ratios, so the way to the
     bench appears when there is genuinely something to burn and stays absent
     otherwise. A permanent link to a bench a member cannot use is an
     advertisement, and the design system is explicit that a card which only
     announces has not earned its slot. */
  const canCraft = useMemo(() => {
    if (!own || !craft?.open) return false;
    const byRarity = new Map<string, number>();
    for (const copy of cards) {
      byRarity.set(copy.rarity, (byRarity.get(copy.rarity) ?? 0) + 1);
    }
    return craft.steps.some((s) => (byRarity.get(s.from) ?? 0) >= s.burn);
  }, [own, craft, cards]);

  if (sealed) {
    return (
      <Card pad="none">
        <EmptyState
          icon3d="vault"
          title="This collection is kept private"
          body="The keeper of this Keep has sealed their Hoard. What they hold is theirs to show."
        />
      </Card>
    );
  }

  if (stacks.length === 0) {
    return (
      <Card pad="none">
        <EmptyState
          icon3d="chest"
          title={own ? "Your Hoard is empty" : "Nothing in this Hoard yet"}
          body={
            own
              ? "Warchests are sealed until launch. When the first one opens, every card you pull lands here, and every card here can be carried to your own wallet."
              : "This Keep holds no cards yet. The first Warchests are still sealed."
          }
          {...(own
            ? {
                action: (
                  <Button variant="gold" size="lg" render={<Link href="/warchests" />}>
                    See the Warchests
                  </Button>
                ),
              }
            : {})}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The set line, computed from the collection so it cannot drift from
          the tiles below it. Numbers line up: this is a count, and counts are
          read by comparison. */}
      <Card
        variant="raised"
        pad="none"
        radius="lg"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
      >
        <p className="tnum flex flex-wrap gap-x-4 gap-y-1 text-xs text-bone-mut">
          <span className="font-semibold text-bone">
            {summary.distinct} of {summary.setSize} cards
          </span>
          <span>
            {summary.copies} {summary.copies === 1 ? "copy" : "copies"}
          </span>
          {summary.byRarity.mythic ? (
            <span>{summary.byRarity.mythic} mythic</span>
          ) : null}
          {summary.byRarity.legendary ? (
            <span>{summary.byRarity.legendary} legendary</span>
          ) : null}
          {summary.byRarity.epic ? <span>{summary.byRarity.epic} epic</span> : null}
          {summary.byRarity.rare ? <span>{summary.byRarity.rare} rare</span> : null}
          {summary.minted > 0 ? (
            <span className="font-semibold text-gold">
              {summary.minted} on-chain
            </span>
          ) : null}
          {summary.listed > 0 ? (
            <span>{summary.listed} on the Bazaar</span>
          ) : null}
        </p>

        {/* The way out of a pile of duplicates, and only when there is one.
            The trophy case is where a member notices they hold four of the
            same rare, so it is where the sink has to be offered. */}
        <span className="flex flex-wrap items-center gap-2">
          {canCraft ? (
            <Button size="sm" render={<Link href="/reliquary/craft" />}>
              <Icon name="flame" className="h-3.5 w-3.5 text-gold" />
              Craft duplicates
            </Button>
          ) : null}

          {/* The way to the market, and only for a keeper who could actually
              trade there. A permanent link to a board a member cannot use is an
              advertisement, and the design system is explicit that a card which
              only announces has not earned its slot. */}
          {own && market?.open ? (
            <Button size="sm" render={<Link href="/market" />}>
              <Icon name="coin" className="h-3.5 w-3.5 text-gold" />
              The Bazaar
            </Button>
          ) : null}
        </span>
      </Card>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {stacks.map((entry) => (
          <HoardTile
            key={entry.key}
            stack={entry}
            own={own}
            mint={mint}
            market={market}
            onClaimed={onClaimed}
            onListed={onListed}
          />
        ))}
      </ul>
    </div>
  );
}
