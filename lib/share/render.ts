import "server-only";
import { OG_GENERIC, ogNumber, ogTrim, type OgCardProps, type OgStat } from "@/lib/share/og";
import type { ShareTarget } from "@/lib/share/links";
import {
  readKeepSubject,
  readCallSubject,
  readHouseSubject,
  readCrestSubject,
  readProofSubject,
  readListingSubject,
  readTradeSubject,
  type ShareDb,
} from "@/lib/share/subjects";
import { isDrawReference } from "@/lib/collectibles/verify";
import type { EarningsStatement } from "@/lib/economy/earnings";

/* THE ONE PLACE A SHARE TARGET BECOMES A CARD.
 *
 * Before this file, the seven opengraph-image.tsx routes each read their own
 * subject and built their own OgCardProps inline: seven copies of the same
 * shape of code, seven places a stat label or a tone could quietly drift from
 * its neighbours. This is the single source of truth those routes now call
 * into, and it is also what the app's own share sheet (components/share/
 * share-sheet.tsx, via app/api/share/card/route.ts) calls to render the exact
 * same card as a live preview and a downloadable image, rather than a second
 * hand drawn approximation of it.
 *
 * Returns OG_GENERIC, never throws, for any target whose subject cannot be
 * read: does not exist, was removed, is sealed, or the database is
 * unreachable. See lib/share/subjects.ts for why that is the correct answer
 * rather than an error page baked into an image.
 */
export async function renderShareCard(
  target: ShareTarget,
  client?: ShareDb | null
): Promise<OgCardProps> {
  switch (target.kind) {
    case "keep": {
      const keep = await readKeepSubject(target.handle, client);
      if (!keep) return OG_GENERIC;

      const stats: OgStat[] = [
        { label: "RENOWN", value: ogNumber(keep.renown) },
        { label: "GLORY", value: ogNumber(keep.glory) },
      ];
      if (keep.crests > 0) {
        stats.push({ label: "CRESTS", value: ogNumber(keep.crests) });
      }
      if (keep.callsWon + keep.callsLost > 0) {
        stats.push({
          label: "CALLS",
          value: `${ogNumber(keep.callsWon)}/${ogNumber(keep.callsWon + keep.callsLost)}`,
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

      const identity = [`@${keep.handle}`, keep.tier, keep.houseName].filter(
        Boolean
      ) as string[];

      return {
        kicker: "THE KEEP",
        headline: ogTrim(keep.name, 34) ?? `@${keep.handle}`,
        subline: identity.join("  ·  "),
        stats: stats.slice(0, 4),
        glow: "right",
      };
    }

    case "call": {
      const call = await readCallSubject(target.id, client);
      if (!call) return OG_GENERIC;

      const stats: OgStat[] = [];
      if (call.score !== null) {
        stats.push({
          label: "RENOWN",
          value: ogNumber(call.score),
          tone: call.verdict === "miss" ? "ember" : "gold",
        });
      }
      if (call.confidence !== null) {
        stats.push({ label: "CONFIDENCE", value: `${call.confidence}%`, tone: "bone" });
      }
      if (call.threshold !== null) {
        stats.push({ label: "MOVE REQUIRED", value: `${call.threshold}%`, tone: "bone" });
      }

      const verdict =
        call.verdict === "hit"
          ? { label: "HIT", tone: "gold" as const }
          : call.verdict === "miss"
            ? { label: "MISS", tone: "ember" as const }
            : call.verdict === "void"
              ? { label: "VOID", tone: "steel" as const }
              : { label: "OPEN", tone: "steel" as const };

      return {
        kicker: call.verdict === "open" ? "A CALL, SEALED" : "A CALL, RESOLVED",
        headline: call.claim,
        subline: call.callerHandle
          ? `${call.callerName}  ·  @${call.callerHandle}`
          : call.callerName,
        body: ogTrim(call.rationale, 150),
        stats,
        verdict,
        glow: "left",
      };
    }

    case "house": {
      const house = await readHouseSubject(target.slug, client);
      if (!house) return OG_GENERIC;

      return {
        kicker: "A HOUSE",
        headline: house.name,
        subline: house.seasonName
          ? `${house.motto}  ·  ${house.seasonName}`
          : house.motto,
        stats: [
          {
            label: "STANDING",
            value: `${house.rank}/${house.houses}`,
            tone: house.rank === 1 ? "gold" : "bone",
          },
          { label: "GLORY", value: ogNumber(house.score) },
          { label: "SWORN", value: ogNumber(house.members), tone: "bone" },
          { label: "LEVEL", value: ogNumber(house.level), tone: "bone" },
        ],
        glow: "right",
      };
    }

    case "crest": {
      const crest = await readCrestSubject(target.handle, target.slug, client);
      if (!crest) return OG_GENERIC;

      return {
        kicker: "A CREST EARNED",
        headline: crest.crestName,
        subline: `${crest.holderName}  ·  @${crest.holderHandle}`,
        body: ogTrim(crest.earn, 130),
        stats: [
          {
            label: "IN THE REALM",
            value: crest.holders === 1 ? "The only one" : ogNumber(crest.holders),
          },
          { label: "RARITY", value: crest.rarity.toUpperCase(), tone: "bone" },
        ],
        glow: "right",
      };
    }

    case "proof": {
      const proof = isDrawReference(target.reference)
        ? await readProofSubject(target.reference, client)
        : null;
      if (!proof) return OG_GENERIC;

      return {
        kicker: "PROVABLY FAIR",
        headline: proof.chestName,
        subline: proof.best
          ? `${proof.best}${proof.bestRarity ? `  ·  ${proof.bestRarity}` : ""}`
          : "Opened, revealed and on the record",
        stats: [
          { label: "CARDS DEALT", value: ogNumber(proof.cards) },
          { label: "COMMITMENT", value: proof.commitment, tone: "bone" },
        ],
        verdict: { label: "CHECKABLE", tone: "gold" },
        glow: "left",
      };
    }

    case "listing": {
      const listing = await readListingSubject(target.id, client);
      if (!listing) return OG_GENERIC;

      const LISTING_VERDICT: Record<
        string,
        { label: string; tone: "gold" | "ember" | "steel" }
      > = {
        active: { label: "FOR SALE", tone: "gold" },
        reserved: { label: "RESERVED", tone: "steel" },
        settled: { label: "SOLD", tone: "ember" },
        cancelled: { label: "WITHDRAWN", tone: "steel" },
      };

      return {
        kicker: "THE BAZAAR",
        headline: listing.cardName,
        subline:
          [
            listing.cardTitle,
            listing.sellerHandle ? `listed by @${listing.sellerHandle}` : null,
          ]
            .filter(Boolean)
            .join("  ·  ") || null,
        stats: [
          { label: "PRICE", value: listing.price },
          { label: "RARITY", value: listing.rarity.toUpperCase(), tone: "bone" },
        ],
        verdict: LISTING_VERDICT[listing.status] ?? null,
        glow: "right",
      };
    }

    case "trade": {
      const trade = await readTradeSubject(target.id, client);
      if (!trade) return OG_GENERIC;

      const KIND_LABEL: Record<string, string> = {
        buy: "BOUGHT",
        sell: "SOLD",
        swap: "SWAPPED",
      };
      const headline =
        trade.kind === "sell"
          ? (trade.sellSymbol ?? "a coin")
          : trade.kind === "swap"
            ? `${trade.sellSymbol ?? "a coin"} → ${trade.buySymbol ?? "a coin"}`
            : (trade.buySymbol ?? "a coin");

      return {
        kicker: "THE SCRYING GLASS",
        headline,
        subline: [
          trade.traderHandle ? `@${trade.traderHandle}` : trade.traderName,
          trade.chainName,
        ]
          .filter(Boolean)
          .join("  ·  "),
        verdict: { label: KIND_LABEL[trade.kind] ?? "TRADED", tone: "gold" },
        glow: "left",
      };
    }

    default:
      return OG_GENERIC;
  }
}

/* THE COFFERS, as a card. The one card in the set with no ShareTarget at all.
 *
 * Every subject above is read anonymously, by design: a Call or a Keep is
 * meant to unfurl for a stranger holding the link. A member's earnings are
 * not, even when they have turned pnlVisible on for other members browsing
 * their Keep in the product (see lib/share/subjects.ts's KeepSubject, which
 * deliberately omits earnings for exactly this reason). An image at a
 * permanent, guessable URL is the wrong place for a number that says what
 * somebody has earned, no matter how visible they have chosen to be inside
 * the product itself.
 *
 * So this card has no public route. app/api/share/coffers/route.ts, its only
 * caller, requires a session and always renders the CALLING member's own
 * statement: there is no id parameter anywhere in that path for a stranger's
 * data to leak through. What is shown is POINTS, per house rule 7, never
 * $RSP and never a wallet figure: the same restraint every other card here
 * already holds, applied to the one card that is actually about a balance.
 */
export function renderCoffersCard(input: {
  name: string;
  handle: string;
  tier: string | null;
  houseName: string | null;
  statement: EarningsStatement;
  glory: number;
}): OgCardProps {
  const { statement } = input;
  const topStream = [...statement.streams]
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points)[0];

  const stats: OgStat[] = [{ label: "GLORY", value: ogNumber(input.glory) }];
  if (topStream) {
    stats.push({
      label: `TOP: ${topStream.label.toUpperCase()}`,
      value: ogNumber(topStream.points),
      tone: "bone",
    });
  }
  if (statement.given > 0) {
    stats.push({ label: "GIVEN TO HOUSE", value: ogNumber(statement.given), tone: "bone" });
  }
  if (statement.firstAt) {
    stats.push({
      label: "SINCE",
      value: new Date(statement.firstAt)
        .toLocaleDateString("en-US", { month: "short", year: "numeric" })
        .toUpperCase(),
      tone: "bone",
    });
  }

  const identity = [`@${input.handle}`, input.tier, input.houseName].filter(
    Boolean
  ) as string[];

  return {
    kicker: "THE COFFERS",
    headline: `${ogNumber(statement.earned)} POINTS EARNED`,
    subline: identity.join("  ·  ") || ogTrim(input.name, 34),
    stats: stats.slice(0, 4),
    glow: "left",
  };
}
