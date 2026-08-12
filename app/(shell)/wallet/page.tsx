import { permanentRedirect } from "next/navigation";

/* `/wallet` was a second Vault.

   It rendered the same `WalletSection` behind its own hand written copy of the
   signed-out state, and it had drifted from the one at `/vault` in every way a
   copy drifts. It re-derived the Console frame inline (`max-w-2xl px-3 py-4`)
   rather than using `ConsolePage`, so it never picked up the compact density
   the archetype requires above `md`. It had no back control, which house rule
   16 requires of every page that can be navigated into. Its loading state was
   three `animate-pulse` slabs rather than shaped skeletons behind the delay
   gate, so a fast read flashed a broken layout and a slow one promised a card
   that was never the shape of what arrived. Its empty state carried a 56px
   gold circle and a 2xl gold heading, which is the Forge register on a surface
   whose ornament budget is zero.

   Nothing in the product linked here. `lib/nav.ts` points the one Vault entry
   at `/vault` and uses "Wallet" only as the plain-language label for it, so
   this route was reachable only by typing it or by an old bookmark. Two money
   surfaces rendering the same balances with different rules is the most
   expensive kind of drift there is, and the cheapest fix is to stop having two.

   A redirect rather than a delete, because a URL a member may have saved
   should still arrive somewhere true. Permanent, because it is not coming
   back. */
export default function WalletPage(): never {
  permanentRedirect("/vault");
}
