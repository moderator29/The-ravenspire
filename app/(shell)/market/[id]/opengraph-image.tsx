import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
} from "@/lib/share/og";
import { readListingSubject } from "@/lib/share/subjects";

/* A Bazaar listing, as a share card.
 *
 * The only card in the set with a price on it, which is the one number a share
 * card has to be most careful with. It is the price the seller named and
 * nothing else: no floor, no appraisal, no estimated value and no "worth". The
 * per rarity floor is what the platform commits to standing behind rather than
 * a market price, and a card that put it beside a listing would be quoting it
 * as one whatever the label said. lib/commerce/market-board.ts refuses to
 * import the catalogue for the same reason and this route does not either.
 *
 * A withdrawn or sold listing still unfurls, and says so. Somebody following a
 * link to a card that has just gone is entitled to be told it went, and the
 * card is the honest place to say it: the alternative is a preview that keeps
 * advertising a sale that already happened.
 */

export const dynamic = "force-dynamic";

export const alt = "A card on the Bazaar of The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const VERDICT: Record<string, { label: string; tone: "gold" | "ember" | "steel" }> = {
  active: { label: "FOR SALE", tone: "gold" },
  reserved: { label: "RESERVED", tone: "steel" },
  settled: { label: "SOLD", tone: "ember" },
  cancelled: { label: "WITHDRAWN", tone: "steel" },
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await readListingSubject(id);

  if (!listing) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  return new ImageResponse(
    (
      <OgCard
        kicker="THE BAZAAR"
        headline={listing.cardName}
        subline={
          [
            listing.cardTitle,
            listing.sellerHandle ? `listed by @${listing.sellerHandle}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ") || null
        }
        stats={[
          { label: "PRICE", value: listing.price },
          {
            label: "RARITY",
            value: listing.rarity.toUpperCase(),
            tone: "bone",
          },
        ]}
        verdict={VERDICT[listing.status] ?? null}
        glow="right"
      />
    ),
    { ...size }
  );
}
