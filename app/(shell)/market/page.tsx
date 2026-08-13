import type { Metadata } from "next";
import { BoardHeader, BoardPage } from "@/components/board/board-shell";
import { Bazaar } from "@/components/market/bazaar";

export const metadata: Metadata = {
  title: "The Bazaar",
  description:
    "Trade cards with other members. The buyer pays the seller directly and the realm never holds the card or the money.",
};

/* THE BAZAAR: the native secondary market (V2 mission 4).
 *
 * It lives at the top level rather than under the Reliquary, unlike the
 * crafting bench, and the difference is worth stating. Crafting is something a
 * member does to their own collection, so it belongs beside the collection. A
 * market is a place where two members meet, and it is a destination in its own
 * right: half the people arriving here have nothing to sell and are looking for
 * a card, which is not an errand inside somebody's own Reliquary.
 *
 * A Board, and section 2's rules for one apply without exception: compact
 * density above `md`, right aligned tabular prices, hairline dividers, no
 * zebra, ornament budget zero. A marketplace defaults to a wall of images
 * everywhere else on the internet and it is the wrong shape here, because the
 * job on this screen is comparing prices and prices are read by lining them up.
 * The Hoard is where cards are meant to look beautiful.
 *
 * The BoardHeader carries the back control house rule 16 requires.
 */

export default function MarketPage() {
  return (
    <BoardPage width="wide">
      <BoardHeader
        title="The Bazaar"
        kicker="Member to member, nobody in the middle"
        lede="Cards other members are selling. You pay them directly, from your own wallet to theirs, and the realm never takes custody of the card or the payment."
        backHref="/reliquary"
      />

      <div className="mt-4 md:mt-3">
        <Bazaar />
      </div>
    </BoardPage>
  );
}
