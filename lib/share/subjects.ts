import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { privacyGates } from "@/lib/privacy";
import { houseBySlug, houseLevel } from "@/lib/data/houses";
import { loadSeasonWindow } from "@/lib/houses/oath";
import {
  buildStandings,
  loadCumulative,
  loadMemberCounts,
  loadSeasonContributions,
} from "@/lib/houses/scoring";
import { readListing } from "@/lib/commerce/market-board";
import { readHoard } from "@/lib/collectibles/hoard";
import { normalizeCall } from "@/lib/calls/types";
import { findCrest } from "@/components/brand/crests";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";

/* WHAT A SHARE CARD IS ALLOWED TO KNOW.
 *
 * This module is the privacy boundary of mission 10 and it is the only reason
 * the readers are here rather than inline in six image routes. Everything below
 * runs under the service role, because every table in this schema is RLS deny
 * by default (auth.uid() is always null under Privy), so the projection IS the
 * security boundary. That is why nothing here is a `select *`.
 *
 * THE RULE, AND IT IS ONE SENTENCE.
 *
 *   A share card may show only what an anonymous caller can already read from
 *   the public API for that same subject, and never a balance.
 *
 * The first half means there is no new disclosure anywhere in this feature. If
 * /api/hoard would seal a collection from a signed-out reader, the image seals
 * it. If /api/profile/earnings would withhold the earnings block, the image has
 * no earnings on it to withhold. A share card that could tell a stranger
 * something the product's own public endpoints would not is a privacy hole with
 * a nicer typeface.
 *
 * The second half is stricter than the API and deliberate. Points, $RSP, wallet
 * addresses and PnL never appear on any card, even for a member whose
 * pnlVisible is on, because an image at a guessable URL is the wrong place for
 * a number that tells somebody what a member is worth. Renown and Glory are on
 * the cards, and they are not balances: they are standing, they are already on
 * every leaderboard in the realm, and they cannot be spent.
 *
 * AN IMAGE HAS NO VIEWER, WHICH IS THE PART THAT IS EASY TO GET WRONG.
 * Every privacy gate elsewhere in the product reads `isOwner || flag`, because
 * a member must always see their own. A crawler holding a URL is never the
 * owner and can never be authenticated, so the gates here read the raw flag
 * with no owner branch anywhere in the file. Adding one would mean a member
 * could see their own hidden Hoard in a preview, conclude it renders, and share
 * a link that shows everybody else something different from what they saw.
 * Worse, whoever added it would have to fetch a bearer token into an image
 * route to do it, which is the moment this stops being an image route.
 *
 * NULL IS A REAL ANSWER. Every reader returns null when the subject does not
 * exist, is not readable, or is sealed. The image routes render the realm's
 * generic card for null, which is honest: it says The Ravenspire and nothing
 * about anybody. There is no invented member, no sample Call and no placeholder
 * price anywhere in this file (rule 4), and an empty subject is by far the most
 * common case today because most of the collectibles realm is still sealed.
 */

const UNDEFINED_TABLE = "42P01";

/* The service-role client, or a stand-in for one.
 *
 * Every reader takes an optional client and falls back to adminClient(). That
 * is not dependency injection for its own sake: this module is the privacy
 * boundary of the whole feature, and a boundary nobody can write a test against
 * is a boundary nobody has watched hold. lib/share/subjects.test.ts drives a
 * sealed Hoard, a banned member, a restricted Call and an unheld crest through
 * these functions with a stub, which is the only way to be sure the gates fire
 * before a real member's settings depend on it.
 *
 * Typed as SupabaseClient because that is what it is at runtime; the tests pass
 * a double that implements the handful of calls below. */
export type ShareDb = SupabaseClient;

/* Errors are swallowed into null throughout, on purpose. A share card is
   rendered inside a crawler's request for a preview, and an image route that
   throws produces a broken image on somebody else's timeline rather than a
   stack trace anybody will read. The generic card is always a better answer
   than no card. */
async function safely<T>(run: () => Promise<T | null>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) return null;
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* A member's Keep                                                     */
/* ------------------------------------------------------------------ */

export type KeepSubject = {
  name: string;
  handle: string;
  tier: string | null;
  houseName: string | null;
  renown: number;
  glory: number;
  crests: number;
  /* Their Call record, which /api/profile/earnings already publishes to an
     anonymous caller with no gate at all. */
  callsWon: number;
  callsLost: number;
  /* The collection, only when the member has not sealed it, and only ever as
     counts. Never a card list: a share card naming which mythic somebody holds
     is a shopping list for whoever wants to buy or steal it. */
  hoard: { copies: number; distinct: number; setSize: number } | null;
};

export async function readKeepSubject(
  handle: string,
  client?: ShareDb | null
): Promise<KeepSubject | null> {
  const db = client ?? adminClient();
  if (!db) return null;

  return safely(async () => {
    const { data } = await db
      .from("profiles")
      .select(
        "id, handle, display_name, tier, renown, glory, house_slug, settings, is_banned"
      )
      .eq("handle", handle.toLowerCase())
      .maybeSingle();
    if (!data) return null;

    /* A banned member has no Keep to unfurl. The page already refuses them;
       an image that kept working would be a removed account still being
       distributed by the product that removed it. */
    if ((data as { is_banned?: boolean }).is_banned === true) return null;

    const id = data.id as string;
    const gates = privacyGates(data.settings);

    const [callsRes, crestsRes] = await Promise.all([
      db
        .from("posts")
        .select("call")
        .eq("author_id", id)
        .eq("kind", "call")
        .eq("deleted", false)
        .limit(1000),
      db
        .from("user_crests")
        .select("crest_slug", { count: "exact", head: true })
        .eq("profile_id", id),
    ]);

    let callsWon = 0;
    let callsLost = 0;
    for (const row of (callsRes.data ?? []) as {
      call: { verdict?: string } | null;
    }[]) {
      if (row.call?.verdict === "hit") callsWon += 1;
      else if (row.call?.verdict === "miss") callsLost += 1;
    }

    /* THE GATE. Raw flag, no owner branch. See the header. */
    let hoard: KeepSubject["hoard"] = null;
    if (gates.hoard) {
      const read = await safely(() => readHoard(db, id));
      if (read && read.summary.copies > 0) {
        hoard = {
          copies: read.summary.copies,
          distinct: read.summary.distinct,
          setSize: read.summary.setSize,
        };
      }
    }

    const house = houseBySlug(data.house_slug as string | null);
    return {
      name:
        (data.display_name as string | null) ?? `@${data.handle as string}`,
      handle: data.handle as string,
      tier: (data.tier as string | null) ?? null,
      houseName: house?.name ?? null,
      renown: (data.renown as number) ?? 0,
      glory: (data.glory as number) ?? 0,
      crests: crestsRes.count ?? 0,
      callsWon,
      callsLost,
      hoard,
    };
  });
}

/* ------------------------------------------------------------------ */
/* One Call                                                            */
/* ------------------------------------------------------------------ */

export type CallSubject = {
  token: string;
  stance: string;
  verdict: "open" | "hit" | "miss" | "void";
  /* The Renown the settlement minted, present only once it has settled. */
  score: number | null;
  /* The member's stated confidence, as a percentage, when they gave one. */
  confidence: number | null;
  /* The move the Call required, as a percentage, when it required one. */
  threshold: number | null;
  callerName: string;
  callerHandle: string | null;
  rationale: string | null;
};

export async function readCallSubject(
  id: string,
  client?: ShareDb | null
): Promise<CallSubject | null> {
  const db = client ?? adminClient();
  if (!db) return null;

  return safely(async () => {
    const { data } = await db
      .from("posts")
      .select(
        "id, call, visibility, deleted, author:profiles!posts_author_id_fkey (handle, display_name)"
      )
      .eq("id", id)
      .eq("kind", "call")
      .maybeSingle();
    if (!data) return null;

    const row = data as unknown as {
      call: unknown;
      visibility: string | null;
      deleted: boolean | null;
      author: { handle: string | null; display_name: string | null } | null;
    };

    /* Same refusal /post/[id]'s card has carried since it shipped: a share
       card is read by anybody holding the link, so only a public, undeleted
       Call may unfurl. A restricted Call that unfurled would publish its own
       audience restriction to the whole internet. */
    if (row.deleted || row.visibility !== "public") return null;

    const call = normalizeCall(row.call);
    if (!call) return null;

    const author = row.author;
    return {
      token: (call.token ?? "").toUpperCase() || "A CALL",
      /* The realm's own words for the two directions. "up" and "down" are how
         the scorer names them; a card facing outward says which way the member
         actually called it. */
      stance: call.stance === "down" ? "DOWN" : "UP",
      verdict: (call.verdict ?? "open") as CallSubject["verdict"],
      score: typeof call.score === "number" ? call.score : null,
      confidence:
        typeof call.confidence === "number"
          ? Math.round(call.confidence * 100)
          : null,
      threshold:
        typeof call.threshold === "number" && call.threshold > 0
          ? Math.round(call.threshold * 100)
          : null,
      callerName:
        author?.display_name ??
        (author?.handle ? `@${author.handle}` : "A member of the realm"),
      callerHandle: author?.handle ?? null,
      rationale: call.rationale ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* A House and where it stands                                         */
/* ------------------------------------------------------------------ */

export type HouseSubject = {
  name: string;
  motto: string;
  rank: number;
  houses: number;
  score: number;
  members: number;
  level: number;
  seasonName: string | null;
};

export async function readHouseSubject(
  slug: string,
  client?: ShareDb | null
): Promise<HouseSubject | null> {
  const house = houseBySlug(slug);
  if (!house) return null;
  const db = client ?? adminClient();
  if (!db) return null;

  return safely(async () => {
    /* Scored exactly the way /api/houses scores it: top twenty contributors,
       computed live off the ledger. A share card that read houses.glory would
       publish a headcount contest as a standing, which is the bug section 11.1b
       exists to have fixed. One scoring rule, one answer, everywhere. */
    const window = await loadSeasonWindow(db);
    const season = window.latest;
    const [contributions, memberCounts, cumulative] = await Promise.all([
      season ? loadSeasonContributions(db, season.id) : Promise.resolve([]),
      loadMemberCounts(db),
      loadCumulative(db, season?.id ?? null),
    ]);
    const standings = buildStandings(contributions, memberCounts);
    const self = standings.find((s) => s.slug === house.slug);
    if (!self) return null;

    const total = (cumulative.get(house.slug) ?? 0) + self.score;
    return {
      name: house.name,
      motto: house.motto,
      rank: self.rank,
      houses: standings.length,
      score: Math.round(self.score),
      members: self.memberCount,
      level: houseLevel(total).level,
      seasonName: season?.name ?? null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* A crest a member holds                                              */
/* ------------------------------------------------------------------ */

export type CrestSubject = {
  crestName: string;
  rarity: string;
  earn: string;
  holderName: string;
  holderHandle: string;
  earnedAt: string | null;
  /* How many members in the whole realm hold it. The reason a crest is worth
     showing anybody: "one of nine" is a fact, "legendary" is a label. */
  holders: number;
};

export async function readCrestSubject(
  handle: string,
  slug: string,
  client?: ShareDb | null
): Promise<CrestSubject | null> {
  const crest = findCrest(slug);
  if (!crest) return null;
  const db = client ?? adminClient();
  if (!db) return null;

  return safely(async () => {
    const { data: profile } = await db
      .from("profiles")
      .select("id, handle, display_name, is_banned")
      .eq("handle", handle.toLowerCase())
      .maybeSingle();
    if (!profile) return null;
    if ((profile as { is_banned?: boolean }).is_banned === true) return null;

    /* Held, or there is nothing to celebrate. A crest page for a member who
       has not earned it would be the product manufacturing an achievement,
       which is rule 4 in its most embarrassing form: an invented trophy. */
    const { data: held } = await db
      .from("user_crests")
      .select("earned_at")
      .eq("profile_id", profile.id as string)
      .eq("crest_slug", crest.slug)
      .maybeSingle();
    if (!held) return null;

    const { count } = await db
      .from("user_crests")
      .select("crest_slug", { count: "exact", head: true })
      .eq("crest_slug", crest.slug);

    return {
      crestName: crest.name,
      rarity: crest.rarity,
      earn: crest.earn,
      holderName:
        (profile.display_name as string | null) ??
        `@${profile.handle as string}`,
      holderHandle: profile.handle as string,
      earnedAt: (held.earned_at as string | null) ?? null,
      holders: count ?? 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* A settled chest opening                                             */
/* ------------------------------------------------------------------ */

export type ProofSubject = {
  chestName: string;
  openedAt: string;
  cards: number;
  best: string | null;
  bestRarity: string | null;
  /* The first twelve characters of the commitment hash. Enough for a human to
     recognise the one they saved, useless for anything else, and the full hash
     is a published fact on /api/chests/openings/[id] anyway. */
  commitment: string;
};

const RARITY_ORDER = ["mythic", "legendary", "epic", "rare"];

export async function readProofSubject(
  reference: string,
  client?: ShareDb | null
): Promise<ProofSubject | null> {
  const db = client ?? adminClient();
  if (!db) return null;

  return safely(async () => {
    /* The same projection /api/chests/openings/[id] documents at length, and
       for the same reasons: no profile_id, no route back to a member, and
       nothing at all from chest_seeds. An opening proves the house dealt these
       cards under this seed. It does not say whose Hoard they landed in, and
       this card must not become the join that reveals it. */
    const { data } = await db
      .from("chest_openings")
      .select("id, chest_sku, result, server_seed_hash, opened_at")
      .eq("id", reference)
      /* Settled only. An unrevealed seed is a live commitment, and a card that
         announced one would be advertising a chest nobody has opened yet. */
      .not("server_seed", "is", null)
      .maybeSingle();
    if (!data) return null;

    const result = (data.result ?? {}) as {
      cards?: { champion_slug?: string; rarity?: string }[];
    };
    const cards = Array.isArray(result.cards) ? result.cards : [];
    let best: { champion_slug?: string; rarity?: string } | null = null;
    for (const card of cards) {
      const rank = RARITY_ORDER.indexOf(card.rarity ?? "");
      const bestRank = best ? RARITY_ORDER.indexOf(best.rarity ?? "") : 99;
      if (rank >= 0 && rank < bestRank) best = card;
    }
    const champion = best?.champion_slug
      ? (SET_ONE.cards.find((c) => c.champion.slug === best?.champion_slug)
          ?.champion.name ?? null)
      : null;

    const sku = data.chest_sku as string;
    const tier = CHEST_TIERS.find((t) => t.sku === sku);
    return {
      chestName: tier?.name ?? "A Warchest",
      openedAt: data.opened_at as string,
      cards: cards.length,
      best: champion,
      bestRarity: best?.rarity ?? null,
      commitment: String(data.server_seed_hash ?? "").slice(0, 12),
    };
  });
}

/* ------------------------------------------------------------------ */
/* One card on the Bazaar                                              */
/* ------------------------------------------------------------------ */

export type ListingSubject = {
  cardName: string;
  cardTitle: string | null;
  rarity: string;
  /* Formatted for display, in the listing's own currency. The only number on
     this card is the price a seller named: no floor, no appraisal and no
     estimated value, which is the position lib/commerce/market-board.ts takes
     and the reason catalog.ts is not imported here either. */
  price: string;
  sellerHandle: string | null;
  status: string;
};

export async function readListingSubject(
  id: string,
  client?: ShareDb | null
): Promise<ListingSubject | null> {
  const db = client ?? adminClient();
  if (!db) return null;

  return safely(async () => {
    const listing = await readListing(db, id);
    if (!listing) return null;
    return {
      cardName: listing.name ?? "A champion",
      cardTitle: listing.title,
      rarity: listing.rarity,
      price: formatMinor(listing.price_minor, listing.currency),
      sellerHandle: listing.seller?.handle ?? null,
      status: listing.status,
    };
  });
}

/* Minor units to a display string. Two decimal places for every currency the
   Bazaar accepts today, which is USD and nothing else; the check is here so a
   zero-decimal currency added later is a compile-time visit to this function
   rather than a price rendered a hundred times too large. */
function formatMinor(minor: number, currency: string): string {
  const symbol = currency.toLowerCase() === "usd" ? "$" : "";
  return `${symbol}${(minor / 100).toFixed(2)}`;
}
