import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_GENERIC,
  OG_SIZE,
} from "@/lib/share/og";
import { readTradeSubject } from "@/lib/share/subjects";

/* A verified trade, as a share card.
 *
 * No amount and no USD value anywhere on this card, the same restraint the
 * page itself carries: verifyTrade proves the transaction and the token
 * that arrived, never a client-claimed figure, so this card states only
 * what actually happened on chain: who, what coin, which chain, verified.
 */

export const dynamic = "force-dynamic";

export const alt = "A verified trade on The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const KIND_LABEL: Record<string, string> = {
  buy: "BOUGHT",
  sell: "SOLD",
  swap: "SWAPPED",
};

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trade = await readTradeSubject(id);

  if (!trade) {
    return new ImageResponse(<OgCard {...OG_GENERIC} />, { ...size });
  }

  const headline =
    trade.kind === "sell"
      ? (trade.sellSymbol ?? "a coin")
      : trade.kind === "swap"
        ? `${trade.sellSymbol ?? "a coin"} → ${trade.buySymbol ?? "a coin"}`
        : (trade.buySymbol ?? "a coin");

  return new ImageResponse(
    (
      <OgCard
        kicker="THE SCRYING GLASS"
        headline={headline}
        subline={[
          trade.traderHandle ? `@${trade.traderHandle}` : trade.traderName,
          trade.chainName,
        ]
          .filter(Boolean)
          .join("  ·  ")}
        verdict={{
          label: KIND_LABEL[trade.kind] ?? "TRADED",
          tone: "gold",
        }}
        glow="left"
      />
    ),
    { ...size }
  );
}
