import type { Metadata } from "next";
import {
  ConsoleHeader,
  ConsolePage,
} from "@/components/console/console-shell";
import { CraftingBench } from "@/components/collectibles/crafting-bench";

export const metadata: Metadata = {
  title: "Crafting",
  description:
    "Burn duplicates from your Hoard to forge a card of the rarity above. The ratios are printed and never change.",
};

/* CRAFTING: the card sink (V2 mission 3, the Spend beat).
 *
 * It lives under the Reliquary because it is a card operation on a card
 * collection, and because the Reliquary is the chapter a member already
 * associates with the set. It is deliberately not inside the Vault or the
 * Keep, where the Hoard is rendered: those are places to look at what you own,
 * and this is a place to destroy some of it. Two different intents deserve two
 * different destinations, and the ConsoleHeader carries the back control that
 * house rule 16 requires either way.
 *
 * A Console, not a Ceremony. Choosing what to burn is the densest, most
 * consequential reading task in the collectibles realm, so it gets the
 * Console's compact density above md and its zero ornament budget. The one
 * Ceremony on this screen is the moment the card comes out, and it is a modal
 * that portals to the body rather than a register the whole page wears.
 */

export default function CraftPage() {
  return (
    <ConsolePage width="wide">
      <ConsoleHeader
        title="Crafting"
        kicker="The Reliquary, the card sink"
        backHref="/reliquary"
      />

      <div className="mt-4 md:mt-3">
        <CraftingBench />
      </div>
    </ConsolePage>
  );
}
