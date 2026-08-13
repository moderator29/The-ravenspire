import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
  ogNumber,
  ogTrim,
  type OgStat,
} from "@/lib/share/og";
import { readKeepSubject } from "@/lib/share/subjects";

/* A member's Keep, as a share card.
 *
 * WHAT IS ON IT, AND WHY EACH THING IS ALLOWED THERE. Renown, Glory, crests
 * held, the Call record and the House. Every one of those is already returned
 * to an anonymous caller by /api/profile/earnings in its `public` block, with
 * no gate, so this card discloses nothing new. The Hoard is on it only when the
 * member's `hoardVisible` says so, which is the same gate /api/hoard applies to
 * a stranger. lib/share/subjects.ts is where all of that is decided and where
 * the reasoning is written out.
 *
 * WHAT IS DELIBERATELY NOT ON IT: points, $RSP, any earnings figure, and the
 * wallet address. A crawler holding a guessed URL is the wrong reader for a
 * number that says what somebody is worth, whatever their pnlVisible says.
 *
 * DYNAMIC, NOT CACHED, and that is a privacy decision rather than a freshness
 * one. An Open Graph route is statically optimised by default in this version
 * of Next. A member who seals their Hoard and finds the realm still serving the
 * open version from a build-time cache has been ignored, so this route reads
 * the gate on every request.
 */

export const dynamic = "force-dynamic";

export const alt = "A Keep on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const keep = await readKeepSubject(handle);

  if (!keep) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  const stats: OgStat[] = [
    { label: "RENOWN", value: ogNumber(keep.renown) },
    { label: "GLORY", value: ogNumber(keep.glory) },
  ];
  /* Only real counts reach the card. A member with no crests gets two stats
     rather than a third reading zero, because a zero presented as a statistic
     is the product telling a stranger this member has failed at something they
     may never have attempted. */
  if (keep.crests > 0) {
    stats.push({ label: "CRESTS", value: ogNumber(keep.crests) });
  }
  if (keep.callsWon + keep.callsLost > 0) {
    stats.push({
      label: "CALLS",
      value: `${ogNumber(keep.callsWon)}/${ogNumber(
        keep.callsWon + keep.callsLost
      )}`,
      tone: keep.callsWon >= keep.callsLost ? "gold" : "ember",
    });
  }
  if (keep.hoard) {
    stats.push({
      label: "HOARD",
      value: `${ogNumber(keep.hoard.distinct)}/${ogNumber(keep.hoard.setSize)}`,
      tone: "bone",
    });
  }

  const identity = [
    `@${keep.handle}`,
    keep.tier,
    keep.houseName,
  ].filter(Boolean) as string[];

  return new ImageResponse(
    (
      <OgCard
        kicker="THE KEEP"
        headline={ogTrim(keep.name, 34) ?? `@${keep.handle}`}
        subline={identity.join("  ·  ")}
        stats={stats.slice(0, 4)}
        glow="right"
      />
    ),
    { ...size }
  );
}
