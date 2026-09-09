import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/share/og";
import { renderShareCard } from "@/lib/share/render";

/* A verified trade, as a share card.
 *
 * No amount and no USD value anywhere on this card, the same restraint the
 * page itself carries: verifyTrade proves the transaction and the token
 * that arrived, never a client-claimed figure, so this card states only
 * what actually happened on chain: who, what coin, which chain, verified.
 * The layout is lib/share/render.ts, shared with the in-app share sheet.
 */

export const dynamic = "force-dynamic";

export const alt = "A verified trade on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const props = await renderShareCard({ kind: "trade", id });
  return new ImageResponse(<OgCard {...props} />, { ...size });
}
