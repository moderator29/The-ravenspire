import type { Metadata } from "next";
import { BackButton } from "@/components/shell/back-button";
import { Icon3D } from "@/components/ui/icon-3d";
import { SeasonZeroView } from "@/components/season-zero/season-zero-view";

/* Season Zero, the founding round.
 *
 * Archetype: Dossier. Hero band, then panels, single column. The hero is the
 * one earned Forge moment on the page (a founding round is a season-scale
 * event, which is exactly what rule 21 reserves the register for); everything
 * under it is Ledger: dense, flat, honest. All live figures render inside
 * SeasonZeroView, which reads them from the API; nothing on this page is a
 * typed-in number except the shared constants every surface agrees on. */

export const metadata: Metadata = {
  title: "Season Zero",
  description:
    "The founding round of The Ravenspire. Back the realm before the gates open wide.",
};

export default function SeasonZeroPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <BackButton />

      <header className="mt-2 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-gold-bright">
            The Founding Round
          </p>
          <h1 className="gold-text mt-1 font-display text-3xl font-semibold sm:text-4xl">
            Season Zero
          </h1>
          {/* Neutral, tense-agnostic copy: SeasonZeroView below reads
              season_zero_live and shows the honest sealed state whenever the
              round is paused, and this header must never contradict it by
              inviting a contribution the view itself is refusing. */}
          <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-bone-mut">
            The founding round: back the realm, wallet to wallet.
          </p>
          <p className="mt-1 text-xs text-bone-faint">
            September 1 to September 20, 2026, UTC, while open.
          </p>
        </div>
        <Icon3D
          name="dragon-egg"
          size="lg"
          className="hidden shrink-0 sm:block"
        />
      </header>

      <div className="mt-5">
        <SeasonZeroView />
      </div>
    </div>
  );
}
