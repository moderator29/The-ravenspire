"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/tabs";
import { useDelayedLoading } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/cx";
import {
  Board,
  BoardCard,
  BoardSkeleton,
  BoardStack,
  BOARD_META,
  type BoardColumn,
} from "@/components/board/board-shell";
import { BuyButton } from "@/components/market/buy-button";
import { feePercentLabel } from "@/components/market/list-button";
import { formatMoney, money } from "@/lib/commerce/money";
import type { Rarity } from "@/lib/game/champions";

/* THE BAZAAR: member to member, and nobody in the middle.
 *
 * A BOARD, NOT A GRID OF CARDS. Every marketplace on the internet defaults to a
 * wall of images, and it is the wrong archetype for this one. Comparison is the
 * job here: a member arriving wants to know what is for sale and at what price,
 * and prices are read by lining them up. Section 2 of the design system is
 * explicit that a Board is an instrument rather than a trophy case, so the
 * ornament budget is zero, the numbers are right aligned and tabular, and the
 * card art is a small identity thumbnail rather than a hero. The Hoard is where
 * cards are meant to look beautiful. This is where they are meant to be
 * compared.
 *
 * DIFFERENT LAYOUTS, NOT ONE SCALED. Five columns cannot become a phone screen,
 * and section 10 forbids a table that scrolls sideways, so below `md` the same
 * rows are a card list with the price kept beside the name. The Board shell
 * will not compile without the card renderer, which is the point of it.
 *
 * THE FEE IS PRINTED ON THE BOARD ITSELF, not behind a link and not only in the
 * sheet where somebody has already decided to buy. A member is entitled to
 * read the terms of a venue before they trade in it, which is the same reason
 * the crafting bench prints its ratios while sealed and a chest prints its odds
 * before it can be bought.
 *
 * NO ESTIMATED VALUE, ANYWHERE. The only number on a row is the price its
 * seller named. There is no floor beside it, no "last sold for", no appraisal
 * and no suggestion. The realm does not know what a card is worth.
 *
 * REAL DATA ONLY. Nothing grants a card yet, so nobody holds anything, so
 * nothing is listed, and the board says exactly that. There is no example
 * listing and there never will be one.
 */

type Listing = {
  id: string;
  set_slug: string;
  card_number: number;
  champion_slug: string;
  rarity: string;
  name: string | null;
  title: string | null;
  art: string | null;
  price_minor: number;
  fee_minor: number;
  fee_bps: number;
  seller_minor: number;
  status: string;
  reserved: boolean;
  own: boolean;
  seller: { handle: string | null; display_name: string | null } | null;
};

type BoardResponse = {
  listings?: Listing[];
  market?: { open: boolean; reason?: string; token?: { symbol: string } };
  terms?: { fee_bps: number; min_price_minor: number; max_price_minor: number };
  error?: string;
};

const RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

function asRarity(value: string): Rarity | null {
  return RARITIES.has(value) ? (value as Rarity) : null;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
  { value: "mythic", label: "Mythic" },
];

/* The identity thumbnail. Deliberately small and deliberately flat: a Board
   row is a line of comparison, and a card face at any real size turns it into
   a gallery. It carries the rarity frame because that is how the whole realm
   spells rarity, and nothing else. */
function Thumb({ listing }: { listing: Listing }) {
  return (
    <span
      className={cx(
        `rarity-${listing.rarity} rarity-frame`,
        "relative block h-10 w-[29px] shrink-0 overflow-hidden rounded-sm bg-void"
      )}
    >
      {listing.art ? (
        <Image
          src={listing.art}
          alt=""
          fill
          sizes="29px"
          className="object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Icon name="layers" className="h-3.5 w-3.5 text-gold/40" />
        </span>
      )}
    </span>
  );
}

function sellerName(listing: Listing): string {
  return (
    listing.seller?.display_name ??
    (listing.seller?.handle ? `@${listing.seller.handle}` : "A member")
  );
}

export function Bazaar() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [market, setMarket] = useState<BoardResponse["market"] | null>(null);
  const [terms, setTerms] = useState<BoardResponse["terms"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");

  const showSkeleton = useDelayedLoading(listings === null && !failed, 300);

  const load = useCallback(async () => {
    const res = await realmFetch<BoardResponse>("/api/market");
    if (!res.ok || !res.data) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setListings(res.data.listings ?? []);
    setMarket(res.data.market ?? null);
    setTerms(res.data.terms ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Filtered here rather than re-fetched. The board is small enough that a
     round trip per chip would be a slower screen for no benefit, and the whole
     set is already in hand. */
  const rows = useMemo(() => {
    const all = listings ?? [];
    return filter === "all" ? all : all.filter((l) => l.rarity === filter);
  }, [listings, filter]);

  const open = market?.open === true;

  const columns: BoardColumn<Listing>[] = [
    {
      key: "card",
      header: "Card",
      cell: (l) => (
        <span className="flex items-center gap-2.5">
          <Thumb listing={l} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-bone">
              {l.name ?? l.champion_slug}
            </span>
            <span className="tnum text-[11px] text-bone-faint">
              Number {l.card_number}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "rarity",
      header: "Rarity",
      cell: (l) => {
        const rarity = asRarity(l.rarity);
        return rarity ? (
          <RarityChip rarity={rarity}>{l.rarity}</RarityChip>
        ) : (
          <span className="text-[11px] text-bone-faint">{l.rarity}</span>
        );
      },
    },
    {
      key: "seller",
      header: "Seller",
      cell: (l) => (
        <span className="truncate">
          {l.own ? (
            <span className="text-gold">Yours</span>
          ) : (
            sellerName(l)
          )}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (l) => (
        <span className="font-semibold text-bone">
          {formatMoney(money(l.price_minor))}
        </span>
      ),
    },
    {
      key: "act",
      header: "",
      numeric: true,
      cell: (l) => <RowAction listing={l} open={open} onChanged={() => void load()} />,
    },
  ];

  if (failed) {
    return (
      <Card>
        <p className="text-sm text-bone-mut">
          The Bazaar could not be read just now. Try again in a moment.
        </p>
      </Card>
    );
  }

  return (
    <BoardStack>
      <Terms terms={terms} open={open} reason={market?.reason} />

      {listings === null ? (
        showSkeleton ? (
          <BoardSkeleton rows={6} columns={5} />
        ) : null
      ) : listings.length === 0 ? (
        <Card pad="none">
          <EmptyState
            icon3d="scales"
            title="Nothing is for sale yet"
            body="The Bazaar is where members trade cards with each other, and nobody holds a card yet. When the first Warchests open, every spare copy in the realm can be listed here."
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
            label="Filter the Bazaar by rarity"
            items={FILTERS}
            value={filter}
            onValueChange={setFilter}
            block
          />

          {rows.length === 0 ? (
            <Card pad="none">
              <EmptyState
                size="sm"
                icon="layers"
                title="Nothing at that rarity"
                body="No card of this rarity is on the board right now."
              />
            </Card>
          ) : (
            <Board
              label="Cards for sale on the Bazaar"
              columns={columns}
              rows={rows}
              rowKey={(l) => l.id}
              highlight={(l) => l.own}
              muted={(l) => l.reserved && !l.own}
              card={(l) => (
                <BoardCard
                  title={l.name ?? l.champion_slug}
                  subtitle={l.own ? "Your listing" : `From ${sellerName(l)}`}
                  leading={<Thumb listing={l} />}
                  trailing={
                    <span className="text-sm font-semibold text-bone">
                      {formatMoney(money(l.price_minor))}
                    </span>
                  }
                  highlight={l.own}
                  badges={
                    asRarity(l.rarity) ? (
                      <RarityChip rarity={asRarity(l.rarity) as Rarity}>
                        {l.rarity}
                      </RarityChip>
                    ) : null
                  }
                  actions={
                    <RowAction listing={l} open={open} onChanged={() => void load()} />
                  }
                />
              )}
            />
          )}
        </>
      )}
    </BoardStack>
  );
}

/* ------------------------------------------------------------------
   The terms of the venue, printed before anybody trades in it.
   ------------------------------------------------------------------ */

function Terms({
  terms,
  open,
  reason,
}: {
  terms: BoardResponse["terms"] | null | undefined;
  open: boolean;
  reason?: string;
}) {
  if (!terms) return null;
  return (
    <Card variant="raised" pad="none" radius="lg" className="px-4 py-3">
      <p className={cx(BOARD_META, "uppercase tracking-[0.2em] text-bone-faint")}>
        How trading here works
      </p>
      <p className="mt-2 text-sm leading-relaxed text-bone-mut">
        The buyer pays the seller&apos;s own wallet directly, and pays a{" "}
        <span className="font-semibold text-bone">
          {feePercentLabel(terms.fee_bps)}% protocol fee
        </span>{" "}
        to the Exchequer. The realm never holds the card and never holds the
        money, not for a moment. Both figures are shown in full before anybody
        signs anything.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-bone-faint">
        Every price here is a price a member named. The realm publishes no
        valuation, no estimate and no suggested price, because it does not know
        what a card is worth.
      </p>
      {!open ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-steel-line bg-void/80 px-2.5 py-1.5 text-[11px] font-semibold text-bone-faint">
          <Icon name="lock" className="h-3 w-3 text-gold" />
          {reason ?? "The Bazaar is sealed until members hold cards to trade"}
        </p>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------
   What a member can do with a row, which is different for their own.
   ------------------------------------------------------------------ */

function RowAction({
  listing,
  open,
  onChanged,
}: {
  listing: Listing;
  open: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const withdraw = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const res = await realmFetch<{ error?: string }>(`/api/market/${listing.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setProblem(res.data?.error ?? "That listing could not be withdrawn");
      return;
    }
    onChanged();
  }, [busy, listing.id, onChanged]);

  /* While the chapter is sealed there is no control at all, rather than a
     disabled one. A dead button is a promise the screen cannot keep, and the
     sealed notice above already says why. */
  if (!open) return null;

  if (listing.own) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button size="sm" dense disabled={busy} onClick={() => void withdraw()}>
          {busy ? "Withdrawing" : "Withdraw"}
        </Button>
        {problem ? (
          <span className="text-[11px] leading-snug text-state-danger">
            {problem}
          </span>
        ) : null}
      </span>
    );
  }

  if (listing.reserved) {
    /* Still on the board, because a reservation lapses, and honest about why
       it cannot be taken right now. */
    return (
      <span className={cx(BOARD_META, "text-bone-faint")}>Being bought</span>
    );
  }

  return <BuyButton listingId={listing.id} onSettled={onChanged} />;
}
