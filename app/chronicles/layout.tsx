import type { Metadata } from "next";
import Link from "next/link";
import { RavenMark } from "@/components/brand/raven-mark";
import { Button } from "@/components/ui/button";
import { ChroniclesCta } from "@/components/chronicles/chronicles-cta";
import {
  ChroniclesMobileRail,
  ChroniclesSidebar,
} from "@/components/chronicles/chronicles-nav";

/* The Chronicles: the public world document, and the deeper layer a visitor
 * reaches from the landing page's own "Read the Chronicles" link. Not the
 * signed-in `/chronicle` (singular), a member's own private Herald digest,
 * which this route never touches.
 *
 * Document archetype throughout (docs/DESIGN-SYSTEM.md section 2): a 680px
 * reading column, comfortable density, a sticky table of contents at `lg`
 * that becomes a horizontal chip rail below it, at most one 3D icon per
 * section heading. Real facts only, the same hard line the product itself
 * holds to: every number and every status label on these five chapters is
 * read from the shipped platform, never rounded up for the pitch.
 */

export const metadata: Metadata = {
  title: {
    template: "%s · The Chronicles · The Ravenspire",
    default: "The Chronicles · The Ravenspire",
  },
  description:
    "The world, the system and the philosophy behind The Ravenspire: a competitive realm where a public prediction becomes a permanent reputation nobody can buy.",
};

export default function ChroniclesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="realm-bg relative min-h-screen">
      <header className="sticky top-0 z-nav border-b border-steel-line/60 bg-obsidian/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 touch:min-h-11 touch:min-w-11 items-center gap-2.5"
            aria-label="The Ravenspire home"
          >
            <RavenMark className="h-6 w-6" />
            <span className="gold-text hidden font-display text-sm font-semibold tracking-[0.16em] sm:inline">
              THE RAVENSPIRE
            </span>
          </Link>
          <span aria-hidden="true" className="hidden text-bone-faint sm:inline">
            /
          </span>
          <span className="hidden font-display text-sm font-semibold uppercase tracking-[0.2em] text-gold sm:inline">
            Chronicles
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="glass"
              size="sm"
              render={<Link href="/" />}
              className="hidden sm:inline-flex"
            >
              The realm
            </Button>
            <ChroniclesCta />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:py-14">
        <ChroniclesSidebar />
        <div className="min-w-0 flex-1">
          <ChroniclesMobileRail />
          <div className="mt-6 lg:mt-0">{children}</div>
        </div>
      </div>
    </main>
  );
}
