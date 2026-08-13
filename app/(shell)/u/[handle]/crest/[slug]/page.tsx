import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CrestRoundel, findCrest } from "@/components/brand/crests";
import { BackButton } from "@/components/shell/back-button";
import { ShareButton } from "@/components/share/share-button";
import { readCrestSubject } from "@/lib/share/subjects";

/* A CREST SOMEBODY HOLDS.
 *
 * Not a catalogue entry: `/renown` is the catalogue, and it lists what can be
 * earned. This page only exists for a crest a named member has actually earned,
 * and answers 404 when they have not. A page that would render for any handle
 * and any slug would be the product manufacturing achievements, which is rule 4
 * in its most embarrassing form.
 *
 * ARCHETYPE: Ceremony, and it is one of the few surfaces that genuinely is one.
 * Section 2 names "Crest unlocked" in the list, and section 21's whole argument
 * is that ornament has to be rationed to mean anything. A crest is rare, it is
 * the thing a member would tell somebody about, and this page is read once. So
 * it takes the Forge register: the roundel at hero scale, gold, one sentence,
 * one number, one action, no panels and no tabs.
 *
 * Rule 22: the roundel carries no caption. The crest's name is the headline
 * beside it, which is the content it belongs to, not a label under a picture.
 *
 * SIGNED OUT, ON PURPOSE. This is a share target, so it is in the public list
 * in lib/share/links.ts and ShellGate lets a visitor read it. Everything on it
 * is a public fact: user_crests carries a public read policy, the holder count
 * is a count of that table, and the member's own Keep is public too.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const subject = await readCrestSubject(handle, slug);
  if (!subject) return { title: "A crest of the realm" };
  return {
    title: `${subject.holderName} holds ${subject.crestName}`,
    description: subject.earn,
  };
}

function earnedOn(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function CrestPage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const subject = await readCrestSubject(handle, slug);
  if (!subject) notFound();

  const crest = findCrest(slug);
  const when = earnedOn(subject.earnedAt);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        {/* Rule 16: every surface that can be navigated into carries a back
            control, and the parent of a crest is the Keep that holds it. */}
        <BackButton href={`/u/${subject.holderHandle}`} />
        <ShareButton
          target={{ kind: "crest", handle: subject.holderHandle, slug }}
          subjectHandle={subject.holderHandle}
          label="Share this crest"
        />
      </div>

      <Card variant="warm" pad="hero" className="flex flex-col items-center gap-5 text-center">
        <CrestRoundel icon={crest?.icon ?? "medal"} className="h-40 w-40" />
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            Earned{when ? ` ${when}` : ""}
          </p>
          <h1 className="gold-text font-display text-3xl font-semibold sm:text-4xl">
            {subject.crestName}
          </h1>
          <p className="text-sm text-bone-mut">
            Held by{" "}
            <Link
              href={`/u/${subject.holderHandle}`}
              className="text-bone underline-offset-4 hover:underline"
            >
              {subject.holderName}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant="gold">{subject.rarity}</Badge>
          {/* The only number on the page, and it is real. "One of nine" is a
              fact a stranger can weigh; "legendary" is a label the realm chose
              for itself. A count of zero is impossible here, because the page
              does not render unless this member holds it. */}
          <Badge>
            {subject.holders === 1
              ? "The only one in the realm"
              : `${subject.holders.toLocaleString("en-US")} in the realm hold it`}
          </Badge>
        </div>
      </Card>

      <Card pad="lg" className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
          How it is earned
        </p>
        <p className="text-sm leading-relaxed text-bone-mut">{subject.earn}</p>
      </Card>

      <Button variant="gold" size="lg" block render={<Link href="/renown" />}>
        See every crest of the realm
      </Button>
    </div>
  );
}
