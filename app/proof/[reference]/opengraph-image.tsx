import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A settled chest opening, as a share card.
 *
 * The card of the six that is closest to being an argument rather than a
 * trophy. What it says is: this chest was drawn under a seed that was committed
 * before anybody could see it, here is the front of that commitment, and you
 * can rerun the whole thing yourself in your own browser without asking us
 * anything. That is worth showing a sceptic, which is precisely who a share
 * card reaches.
 *
 * NOTHING ON IT LEADS BACK TO A MEMBER, and that is load bearing rather than
 * incidental. /api/chests/openings/[id] documents at length why an opening is
 * public and its owner is not: an opening tells you the house dealt these cards
 * under this seed, and nothing joins it to a profile. This card is the most
 * public projection of that row in the product, so it holds the line hardest.
 * No handle, no Keep, no avatar, and the reader for lib/share/subjects.ts does
 * not select profile_id at all. The layout is lib/share/render.ts.
 */

export const dynamic = "force-dynamic";

export const alt = "A provably fair chest opening on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const props = await renderShareCard({ kind: "proof", reference });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
