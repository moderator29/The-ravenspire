import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A member's Keep, as a share card.
 *
 * WHAT IS ON IT, AND WHY EACH THING IS ALLOWED THERE. Renown, Glory, crests
 * held, the Call record and the House. Every one of those is already returned
 * to an anonymous caller by /api/profile/earnings in its `public` block, with
 * no gate, so this card discloses nothing new. The Hoard is on it only when the
 * member's `hoardVisible` says so, which is the same gate /api/hoard applies to
 * a stranger. lib/share/subjects.ts is where all of that is decided and where
 * the reasoning is written out; lib/share/render.ts is where it becomes the
 * card's actual layout, shared with the in-app share sheet.
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
  const props = await renderShareCard({ kind: "keep", handle });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
