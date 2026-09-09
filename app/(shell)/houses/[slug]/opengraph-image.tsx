import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A House and where it stands, as a share card.
 *
 * The only card here that a group of people share at each other rather than
 * outward, which is exactly why it earns its place: a House arguing about its
 * own standing in a group chat is the realm's cheapest recruitment.
 *
 * Scored live off the ledger through the same top-twenty rule /api/houses uses.
 * A card that read houses.glory instead would publish a headcount contest as a
 * standing, and would disagree with the standings board it was screenshotted
 * beside. The layout lives in lib/share/render.ts, shared with the share sheet.
 */

export const dynamic = "force-dynamic";

export const alt = "A House of The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const props = await renderShareCard({ kind: "house", slug });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
