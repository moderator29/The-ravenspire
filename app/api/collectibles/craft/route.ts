import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import { getFlag } from "@/lib/flags";
import {
  CRAFT_STEPS,
  planCraft,
  type CraftCopy,
  type CraftRefusal,
} from "@/lib/collectibles/crafting";

/* Crafting: the card sink.
 *
 * GET  /api/collectibles/craft   the rule, and whether the bench is open
 * POST /api/collectibles/craft   burn N copies, forge one card above them
 *
 * WHAT THE MEMBER SENDS: the copies to burn and the card to forge. Nothing
 * else, and in particular not the ratio, not the rarity of what comes out, and
 * not the collector number of the forged card. Those are derived server side
 * from lib/collectibles/crafting.ts against the real set, because a client that
 * can name its own ratio is a client that can turn one rare into a mythic. Same
 * law as points and as the chest (AGENTS.md rule 8).
 *
 * THE ORDER, and every step is load bearing:
 *   1. The flag. While crafting_live is false every caller meets 423 Locked.
 *   2. The rate limit. A craft is a destructive write on a member's own
 *      property and a loop hammering it is the cheapest way to find a race.
 *   3. The copies, read back from the ledger and scoped to the caller. The
 *      client names ids; the rarity, the set and the ownership all come from
 *      the ledger, never from the request.
 *   4. The rule, in lib/collectibles/crafting.ts: a pure function that decides
 *      whether this is a legal craft and exactly which card comes out. It reads
 *      no clock, no database and no randomness, which is what makes it
 *      testable and what makes crafting a choice rather than a roll.
 *   5. The burn and the forge, in one transaction (public.craft_cards): the
 *      copies are locked, re-checked, destroyed, the craft is recorded and the
 *      forged card lands in the ledger. All of it or none of it. Halfway is a
 *      member's cards gone with nothing to show, or a card forged with the
 *      copies that paid for it still sitting there.
 *
 * WHY GET IS NOT FLAG GATED. The ratios are the crafting equivalent of the
 * odds printed on a chest, and a member is entitled to read the terms of a
 * trade before the trade exists. The bench renders the real rule while sealed
 * and says plainly that it is sealed, which is the same posture
 * /api/chests/seed takes with the fairness commitment.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

/* The Bazaar's own refusal, raised by the trigger on public.inventory when a
   craft tries to burn a card that is listed for sale. It arrives as a database
   error rather than as a verdict because it comes from a trigger inside the
   craft transaction, so it is mapped here into the sentence it deserves: the
   member is not looking at a broken realm, they are looking at their own card
   being on the board. */
const LISTED_ON_THE_BAZAAR = "RS001";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A craft destroys a member's own property, so this is deliberately tighter
   than the chest's sixty an hour. Nobody crafts thirty times in an hour by
   hand, and a loop that wants to race the ledger reads meets the wall long
   before it finds anything. */
const CRAFT_LIMIT = 30;
const CRAFT_WINDOW_SECONDS = 3600;

/* The rule, as the bench reads it. Ratios only: the per rarity floor value the
   ratios are derived from lives in lib/commerce/catalog.ts, is server only by
   design, and is not a number any customer surface renders. */
function printedRule() {
  return CRAFT_STEPS.map((step) => ({
    from: step.from,
    to: step.to,
    burn: step.burn,
  }));
}

async function gate(): Promise<{ open: boolean; reason?: string }> {
  const live = await getFlag("crafting_live");
  return live
    ? { open: true }
    : { open: false, reason: "The crafting bench is sealed until launch" };
}

/* The rule is public, and deliberately needs no caller. It carries no member
   data, and the ratios are the same ratios whether anybody is signed in or
   not. Requiring a token here would make the terms of the trade something only
   members can read, which is the opposite of printing them. */
export async function GET() {
  return json({ steps: printedRule(), crafting: await gate() });
}

/* Why each refusal is refused, in words written for a member rather than for a
   log. Kept beside the union it answers so a new refusal cannot be added
   without a sentence to go with it. */
const REFUSAL_COPY: Record<CraftRefusal, string> = {
  unknown_set: "That set does not exist",
  unknown_rarity: "Cards of that rarity cannot be crafted",
  top_of_ladder: "Mythic is the top of the ladder. There is nothing above it",
  wrong_count: "That is not the number of copies this craft costs",
  duplicate_copy: "The same copy was named more than once",
  wrong_set: "Every copy in a craft must come from the same set",
  wrong_rarity: "Every copy in a craft must be the same rarity",
  unknown_target: "That is not a card you can forge at this rarity",
};

/* What the transaction can refuse, and what to say about it. The route has
   already checked most of these against its own read; reaching one here means
   the ledger moved underneath it, or a bug got past the rule. Either way the
   member is told the truth. */
const SETTLE_COPY: Record<string, { message: string; status: number }> = {
  copies_moved: {
    message:
      "Those copies are no longer yours to burn. Reload your Hoard and try again",
    status: 409,
  },
  carried_on_chain: {
    message:
      "One of those copies is already in your own wallet, so the realm cannot burn it",
    status: 409,
  },
  duplicate_copy: {
    message: "The same copy was named more than once",
    status: 400,
  },
  wrong_count: {
    message: "That is not the number of copies this craft costs",
    status: 400,
  },
};

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const open = await gate();
  if (!open.open) {
    /* 423 Locked: the resource exists, the caller is known, the door is
       sealed. Distinct from 403 (never yours) and 404 (never real), so the
       bench renders "coming soon" rather than "forbidden". */
    return json({ error: open.reason }, 423);
  }

  const rl = await rateLimit(
    profileKey("craft", profile.id),
    CRAFT_LIMIT,
    CRAFT_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const body = (await req.json().catch(() => null)) as {
    set_slug?: unknown;
    from_rarity?: unknown;
    target_champion_slug?: unknown;
    burn_ids?: unknown;
  } | null;

  const setSlug = body?.set_slug;
  const fromRarity = body?.from_rarity;
  const targetChampionSlug = body?.target_champion_slug;
  const burnIds = body?.burn_ids;

  if (
    typeof setSlug !== "string" ||
    typeof fromRarity !== "string" ||
    typeof targetChampionSlug !== "string" ||
    !Array.isArray(burnIds) ||
    burnIds.length === 0 ||
    /* Shape checked before the ledger is queried, and specifically the uuid
       shape. An `in` filter carrying a non-uuid string makes Postgres raise an
       invalid input syntax error, which this route would then report as an
       unavailable realm: a 503 for what is plainly a malformed request, and a
       confusing one to debug from the outside. */
    !burnIds.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return json({ error: "bad request" }, 400);
  }

  /* A ceiling before the ledger is touched at all. The largest real craft
     burns ten copies, so anything past a small multiple of that is somebody
     probing rather than crafting, and an unbounded `in` list is a query nobody
     sized. The rule refuses the wrong count a moment later anyway; this is
     about not asking the database an absurd question first. */
  if (burnIds.length > 64) return json({ error: "bad request" }, 400);

  /* Scoped to the caller: a copy that is not theirs simply does not come back,
     and the count check in the rule turns that into an honest refusal. The
     rarity and the set come from these rows, never from the request. */
  const { data: rows, error: readError } = await db
    .from("inventory")
    .select("id, set_slug, rarity")
    .eq("profile_id", profile.id)
    .in("id", burnIds);

  if (readError) {
    if (readError.code === UNDEFINED_TABLE) {
      return json({ error: "The holdings ledger has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  /* Back into the order the member named them, so a plan's burnIds are the
     member's own selection rather than whatever order the database returned.
     Nothing downstream depends on the order, but a receipt that lists cards in
     an order the member did not choose reads as though something was
     substituted. */
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r] as const));
  const copies: CraftCopy[] = burnIds
    .map((id) => byId.get(id as string))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      id: r.id as string,
      set_slug: r.set_slug as string,
      rarity: r.rarity as string,
    }));

  const plan = planCraft({
    setSlug,
    fromRarity,
    copies,
    targetChampionSlug,
  });

  if (!plan.ok) {
    /* 409 for a craft that is well formed but that the realm's state cannot
       satisfy, 400 for one that was malformed. A member who named four copies
       and only holds three gets the former, which is the truth. */
    const conflict =
      plan.reason === "wrong_count" || plan.reason === "top_of_ladder";
    return json({ error: REFUSAL_COPY[plan.reason] }, conflict ? 409 : 400);
  }

  const { data: settled, error: settleError } = await db.rpc("craft_cards", {
    p_profile_id: profile.id,
    p_set_slug: setSlug,
    p_from_rarity: plan.step.from,
    p_to_rarity: plan.step.to,
    p_burn_ids: plan.burnIds,
    p_required: plan.step.burn,
    p_card: plan.forged,
  });

  if (settleError) {
    if (settleError.code === UNDEFINED_TABLE) {
      return json({ error: "The craft ledger has not been migrated yet" }, 503);
    }
    if (settleError.code === LISTED_ON_THE_BAZAAR) {
      return json(
        {
          error:
            "One of those copies is listed on the Bazaar. Withdraw it before you burn it",
        },
        409
      );
    }
    return json({ error: "unavailable" }, 503);
  }

  const verdict = settled as { ok?: boolean; error?: string; craft_id?: string; inventory_id?: string } | null;

  if (!verdict?.ok) {
    const known = verdict?.error ? SETTLE_COPY[verdict.error] : undefined;
    if (known) return json({ error: known.message }, known.status);
    /* bad_rule, bad_step and bad_card can only be reached by a bug in this
       route, since the rule module has already agreed the craft is legal. They
       are reported as an unavailable realm rather than as the member's fault,
       because it is not. */
    return json({ error: "unavailable" }, 503);
  }

  return json({
    craft: {
      id: verdict.craft_id,
      set_slug: setSlug,
      from_rarity: plan.step.from,
      to_rarity: plan.step.to,
      burned: plan.burnIds.length,
      /* The card that came out, and the ledger row it landed in, so the bench
         can show the forged card and offer to carry it on-chain without
         another read. */
      forged: { ...plan.forged, inventory_id: verdict.inventory_id },
    },
  });
}
