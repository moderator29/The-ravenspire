import { houseBySlug } from "@/lib/data/houses";
import type { CallData } from "@/lib/calls/types";

/* A Call, written as the sentence it is.

   The realm has been showing Calls as a ticker, an arrow and a window, which
   reads as a receipt for a bet. A Call is a claim, and a claim is a sentence, so
   this is what a card, a hero band and a notification all say. One function, so
   the same Call never reads two different ways in two places. */

export function percent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function claimSentence(call: CallData): string {
  const window = call.timeframe ?? "24h";

  if (call.resolver === "internal" && call.claim) {
    const claim = call.claim;
    if (claim.metric === "house_leads") {
      const house = houseBySlug(claim.house_slug);
      return `${house?.name ?? claim.house_slug} leads the realm within ${window}`;
    }
    if (claim.metric === "house_glory") {
      const house = houseBySlug(claim.house_slug);
      return `${house?.name ?? claim.house_slug} reaches ${claim.at_least.toLocaleString()} Glory within ${window}`;
    }
    if (claim.metric === "member_tier") {
      return `A member reaches ${claim.tier} within ${window}`;
    }
    return `A member reaches ${claim.at_least.toLocaleString()} Renown within ${window}`;
  }

  const token = call.token ? `$${call.token}` : "The coin";
  const verb = call.stance === "down" ? "falls" : "rises";
  const threshold = call.threshold ?? 0;
  const move = threshold > 0 ? ` ${percent(threshold)} or more` : "";
  return `${token} ${verb}${move} within ${window}`;
}

/* What the realm settles this Call against, in one phrase. */
export function resolverLine(call: CallData): string {
  if (call.resolver === "internal") {
    return "Settled from the realm's own rows, at no cost and with no oracle to game.";
  }
  if (call.subject?.kind === "dex") {
    return "Settled against a contract address on a named chain, pinned when the Call was sealed.";
  }
  if (call.subject?.kind === "coingecko") {
    return "Settled against a canonical CoinGecko identity, pinned when the Call was sealed.";
  }
  return "Sealed before the realm pinned token identity, so it settles against its ticker.";
}

export const CATEGORY_LABEL: Record<string, string> = {
  markets: "Markets",
  esports: "Esports",
  gaming: "Gaming",
  culture: "Culture",
  sport: "Sport",
  realm: "The realm",
};
