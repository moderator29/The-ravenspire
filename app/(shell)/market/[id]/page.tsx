import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { ShareButton } from "@/components/share/share-button";
import { adminClient } from "@/lib/supabase/admin";
import { readListing } from "@/lib/commerce/market-board";
import { marketGate } from "@/lib/commerce/market-config";

/* ONE CARD ON THE BAZAAR, at its own address.
 *
 * A seller with something worth selling had nowhere to point anybody: the only
 * address the market had was `/market`, the whole board, so "look at this
 * mythic I listed" was a link plus an instruction to scroll. This page is the
 * link.
 *
 * READ ONLY, DELIBERATELY. The purchase flow is non-custodial: it reserves,
 * then the member's own Privy wallet signs a transfer, then settlement verifies
 * it on chain. That belongs in one place, and it is the board, where the
 * reservation clock and the terms of trading are already in view. A second,
 * subtly different buy control on a deep-linked page is how two flows drift
 * and how one of them ends up taking a payment the other cannot settle
 * (rule 6). So this surface shows the card, the price and the seller, and the
 * action is a link into the Bazaar.
 *
 * SEALED IS A STATE, NOT AN ERROR. While `market_live` is off there are no
 * listings, and a stranger who follows an old link should be told the chapter
 * is sealed rather than shown a 404 that reads as the realm losing the record.
 * The gate is read here rather than reinvented: lib/commerce/market-config.ts
 * owns what "the Bazaar is open" means.
 *
 * ARCHETYPE: Dossier at reading width. A subject with a hero and one panel.
 * Ledger register: a listing is a thing to weigh, not a thing to celebrate.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function read(id: string) {
  if (!UUID.test(id)) return null;
  const db = adminClient();
  if (!db) return null;
  try {
    return await readListing(db, id);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await read(id);
  if (!listing) return { title: "The Bazaar" };
  return {
    title: `${listing.name ?? "A champion"} on the Bazaar`,
    description:
      "A card listed by the member who holds it, sold wallet to wallet. The realm never takes custody.",
  };
}

const STATUS_COPY: Record<string, string> = {
  active: "For sale",
  reserved: "Somebody is buying it right now",
  settled: "Sold",
  cancelled: "Withdrawn by the seller",
};

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [listing, gate] = await Promise.all([read(id), marketGate()]);
  if (!listing) notFound();

  const live = listing.status === "active" || listing.status === "reserved";
  const seller = listing.seller;
  const sellerName =
    seller?.display_name ?? (seller?.handle ? `@${seller.handle}` : "A member");

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <BackButton href="/market" />
        <ShareButton
          target={{ kind: "listing", id: listing.id }}
          subjectHandle={seller?.handle ?? null}
          label="Share this listing"
        />
      </div>

      <Card pad="lg" className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className={`rarity-${listing.rarity} rarity-frame relative block h-[184px] w-[132px] shrink-0 self-center overflow-hidden rounded-lg bg-void sm:self-start`}
        >
          {listing.art ? (
            <Image
              src={listing.art}
              alt=""
              fill
              sizes="132px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Icon name="layers" className="h-6 w-6 text-gold/40" />
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            The Bazaar
          </p>
          <h1 className="font-display text-2xl font-semibold text-bone sm:text-3xl">
            {listing.name ?? "A champion"}
          </h1>
          {listing.title ? (
            <p className="text-sm text-bone-mut">{listing.title}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="gold">{listing.rarity}</Badge>
            <Badge>{STATUS_COPY[listing.status] ?? listing.status}</Badge>
          </div>
          {/* The only number on this page is the price the seller named. No
              floor, no appraisal, no estimated value: the per rarity floor is
              what the platform stands behind, not what a card is worth, and a
              market that showed it beside a listing would be quoting it as
              one. lib/commerce/market-board.ts takes the same position. */}
          <p className="pt-2 font-display text-3xl font-semibold text-gold tabular-nums">
            {listing.currency.toLowerCase() === "usd" ? "$" : ""}
            {(listing.price_minor / 100).toFixed(2)}
          </p>
          <p className="text-xs text-bone-faint">
            Listed by{" "}
            {seller?.handle ? (
              <Link
                href={`/u/${seller.handle}`}
                className="text-bone-mut underline-offset-4 hover:underline"
              >
                {sellerName}
              </Link>
            ) : (
              sellerName
            )}
          </p>
        </div>
      </Card>

      <Card variant="inset" pad="lg" className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
          How a trade settles here
        </p>
        <p className="text-sm leading-relaxed text-bone-mut">
          The seller keeps the card until a buyer pays, the buyer pays from their
          own wallet, and the realm never holds either. Buying happens on the
          board, where the reservation clock and the fee are in front of you.
        </p>
      </Card>

      {!gate.open ? (
        <Card tone="ember" pad="lg">
          <p className="text-sm text-bone-mut">{gate.reason}</p>
        </Card>
      ) : null}

      <Button
        variant={live && gate.open ? "gold" : "glass"}
        size="lg"
        block
        render={<Link href="/market" />}
      >
        {live && gate.open ? "Buy it on the Bazaar" : "Go to the Bazaar"}
      </Button>
    </div>
  );
}
