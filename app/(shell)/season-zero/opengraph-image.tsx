import { ImageResponse } from "next/og";
import {
  OgCard,
  OG_CONTENT_TYPE,
  OG_SIZE,
  type OgStat,
} from "@/lib/share/og";
import { getRoundState } from "@/lib/season-zero/server";
import { SEASON_ZERO, formatEth } from "@/lib/season-zero";
import { getFlag } from "@/lib/flags";

/* Season Zero, as a share card.
 *
 * The round's link is the one the founders will post the most while the
 * window is open, so it unfurls with the figures a stranger needs to judge
 * it: the caps, the share of supply, and the raised total. The raised figure
 * is the same chain-verified sum the page shows, read live at render, and it
 * appears only once the round has begun; a card boasting "0 ETH raised"
 * before the window opens would be reading failure into a round that has not
 * started. */

export const dynamic = "force-dynamic";

export const alt = "Season Zero, the founding round of The Ravenspire";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  const [state, live] = await Promise.all([
    getRoundState(),
    getFlag("season_zero_live"),
  ]);

  const stats: OgStat[] = [];
  if (state.phase !== "upcoming") {
    stats.push({
      label: "RAISED",
      value: `${formatEth(state.raisedWei)} ETH`,
      tone: "gold",
    });
  }
  stats.push(
    { label: "SOFTCAP", value: `${SEASON_ZERO.softcapEth} ETH`, tone: "bone" },
    { label: "HARDCAP", value: `${SEASON_ZERO.hardcapEth} ETH`, tone: "bone" },
    { label: "OF SUPPLY", value: `${SEASON_ZERO.supplyPct}%`, tone: "gold" }
  );

  /* `live` gates the verdict before `phase` ever gets a say. `phase` is pure
     date arithmetic (lib/season-zero.ts) and knows nothing about the founder's
     own realm_flags switch, so a share card rendered while the round is
     sealed but sitting inside its calendar window would otherwise say LIVE
     and invite a contribution the round is actively refusing, the exact
     failure the FAQ entry and the disclaimer band elsewhere on the site were
     rewritten to stop making. */
  const verdict = !live
    ? { label: "PAUSED", tone: "steel" as const }
    : state.phase === "live"
      ? { label: "LIVE", tone: "gold" as const }
      : state.phase === "ended"
        ? { label: "CLOSED", tone: "steel" as const }
        : { label: "SEPTEMBER 1", tone: "steel" as const };

  return new ImageResponse(
    (
      <OgCard
        kicker="THE FOUNDING ROUND"
        headline="Season Zero"
        subline="September 1 to 20, 2026 · ETH on Base or Ethereum · wallet to wallet"
        body={`${SEASON_ZERO.rspPerEth.toLocaleString("en-US")} $RSP per ETH, fixed. Verified on chain, never held by the realm.`}
        stats={stats}
        verdict={verdict}
        glow="right"
      />
    ),
    { ...size }
  );
}
