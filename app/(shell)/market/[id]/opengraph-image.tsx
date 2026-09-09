import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A Bazaar listing, as a share card.
 *
 * The only card in the set with a price on it, which is the one number a share
 * card has to be most careful with. It is the price the seller named and
 * nothing else: no floor, no appraisal, no estimated value and no "worth". The
 * per rarity floor is what the platform commits to standing behind rather than
 * a market price, and a card that put it beside a listing would be quoting it
 * as one whatever the label said. lib/commerce/market-board.ts refuses to
 * import the catalogue for the same reason and lib/share/render.ts does not
 * either.
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

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const props = await renderShareCard({ kind: "listing", id });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
