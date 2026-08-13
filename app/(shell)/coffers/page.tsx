import type { Metadata } from "next";
import { ConsoleHeader, ConsolePage } from "@/components/console/console-shell";
import { CoffersConsole } from "@/components/economy/coffers-console";

export const metadata: Metadata = {
  title: "The Coffers",
  description:
    "Everything you have earned in the realm, reconciled against your balance, and every payment that has reached your own wallet.",
};

/* THE COFFERS as a destination (V2 mission 9).

 * A panel on the Keep could show a member a total. It could not show them a
 * statement: the reconciliation between their ledger and their balance, the
 * transaction behind every payment, what staking has actually done to them, and
 * the terms of every surface that pays. That is a screen, and it is a Console,
 * because reading and operating a financial record at the same time is exactly
 * what the archetype is for.
 *
 * `width="data"` rather than `form`: this surface is columns of figures that
 * gain from room, not a control that does not.
 *
 * The panel on the Keep stays where it is. It answers "how am I doing", which
 * is a different question from "show me the record", and the two coexist the
 * same way the Vault and the Ledger do. ConsoleHeader carries the back control
 * house rule 16 requires.
 */

export default function CoffersPage() {
  return (
    <ConsolePage width="data">
      <ConsoleHeader
        title="The Coffers"
        kicker="Earned, and paid"
        backHref="/keep"
      />

      <div className="mt-4 md:mt-3">
        <CoffersConsole />
      </div>
    </ConsolePage>
  );
}
