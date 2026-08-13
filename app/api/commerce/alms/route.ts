import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { getFlag } from "@/lib/flags";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import {
  ALMS_CHEST_SKU,
  ALMS_MIN_ACCOUNT_AGE_DAYS,
  ALMS_PER_MEMBER_DAYS,
  ALMS_REALM_DAILY_CEILING,
  almsClaimParams,
} from "@/lib/commerce/compliance";

/* /api/commerce/alms: the free method of entry.
 *
 * THE ALMS grant a real Squire's Chest. Not a token, not a coupon, not a
 * discount, not a quieter chest wearing the same name. It is a row in
 * chest_entitlements exactly like a purchased one, differing only in
 * source_kind, and it opens through /api/chests/[sku]/open against the same
 * committed seed, on the same printed odds, with the same guaranteed floor and
 * the same provable reveal. No code path anywhere reads source_kind and rolls
 * differently, and none may ever be added.
 *
 * WHY THIS EXISTS. A paid random-reward mechanic commonly needs a genuinely
 * free path to the same reward, of equal dignity. The full reasoning, the four
 * abuse defences, and an explicit list of what this does NOT cover are in
 * lib/commerce/compliance.ts under "THE ALMS". Read that list before assuming
 * this is sufficient for anywhere in particular: nobody who wrote it is a
 * lawyer and it claims compliance with no law.
 *
 * THE FLAG IS THE SAME ONE THE PAID PATH USES, and that is a rule rather than a
 * convenience. The Alms are gated on chests_live and on nothing else. If the
 * chests are sealed there is nothing here to be an alternative to; if they are
 * open the free path is open too. Notably it is NOT gated on
 * COMMERCE_PRICES_CONFIRMED, so the free path can never be narrower than the
 * paid one: the day the founder confirms prices, the Alms have already been
 * available for as long as the chapter has.
 *
 * THE RULES ARE ENFORCED IN public.alms_claim, under a realm-wide advisory
 * lock, because the daily ceiling is the one defence that holds against an
 * attacker with many accounts and a ceiling two requests can race past is not a
 * ceiling. This route decides nothing except the flag.
 */

export const dynamic = "force-dynamic";

/* The chest the Alms grant, named for the surface so it can print the same odds
   table it prints for the paid tier. Non-null by construction: compliance.ts
   refuses to load if this sku is not a digital chest tier. */
const ALMS_TIER = CHEST_TIERS.find((t) => t.sku === ALMS_CHEST_SKU);

const POLICY = {
  chestSku: ALMS_CHEST_SKU,
  chestName: ALMS_TIER?.name ?? ALMS_CHEST_SKU,
  perMemberDays: ALMS_PER_MEMBER_DAYS,
  minAccountAgeDays: ALMS_MIN_ACCOUNT_AGE_DAYS,
  dailyCeiling: ALMS_REALM_DAILY_CEILING,
} as const;

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const live = await getFlag("chests_live");

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db.rpc("alms_state", {
    p_profile_id: profile.id,
    p_window_days: ALMS_PER_MEMBER_DAYS,
    p_min_account_age_days: ALMS_MIN_ACCOUNT_AGE_DAYS,
    p_daily_ceiling: ALMS_REALM_DAILY_CEILING,
  });

  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return json({ error: "not migrated" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  return json({ live, policy: POLICY, state: data ?? null });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  if (!(await getFlag("chests_live"))) {
    return json({ error: "The chests are sealed until launch" }, 423);
  }

  /* A claim is at most one grant per member per 30 days, so this limit is not
     what stops abuse: public.alms_claim is. It exists to stop a loop hammering
     an advisory lock the whole realm shares. */
  const rl = await rateLimit(profileKey("alms", profile.id), 10, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db.rpc("alms_claim", {
    p_profile_id: profile.id,
    ...almsClaimParams(),
  });

  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return json({ error: "not migrated" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  const result = (data ?? null) as
    | {
        ok?: boolean;
        reason?: string;
        entitlement_id?: string;
        chest_sku?: string;
        next_at?: string;
        eligible_at?: string;
        resets_at?: string;
        remaining_today?: number;
        minimum?: number;
      }
    | null;

  if (!result) return json({ error: "unavailable" }, 503);

  if (result.ok !== true) {
    /* Every refusal is said in words with the date attached, because a free
       entry that answers "no" without saying when is not meaningfully
       available. */
    return json(
      {
        error: almsRefusalMessage(result),
        reason: result.reason ?? "not_eligible",
        nextAt: result.next_at ?? null,
        eligibleAt: result.eligible_at ?? null,
        resetsAt: result.resets_at ?? null,
      },
      409
    );
  }

  return json({
    ok: true,
    entitlementId: result.entitlement_id,
    chestSku: result.chest_sku,
    chestName: POLICY.chestName,
    nextAt: result.next_at ?? null,
    remainingToday: result.remaining_today ?? null,
  });
}

function almsRefusalMessage(result: { reason?: string; minimum?: number }): string {
  switch (result.reason) {
    case "age_gate":
      return `The realm asks everyone to confirm they are at least ${result.minimum ?? 18} before opening a chest, paid or free.`;
    case "not_onboarded":
      return "Finish setting up your Keep first. The Alms are for members of the realm.";
    case "account_too_new":
      return `The Alms open to an account ${ALMS_MIN_ACCOUNT_AGE_DAYS} days old. Yours is younger.`;
    case "already_claimed":
      return `You have already taken the Alms. They come round once every ${ALMS_PER_MEMBER_DAYS} days.`;
    case "ceiling_reached":
      /* Said plainly rather than dressed up. If a member meets this often, the
         ceiling is too low and the founder must raise it: a free method of
         entry that is regularly unavailable has become a lottery for a free
         method of entry, which is not the same thing. */
      return "The realm has given all its Alms for today. They are given again at midnight UTC.";
    default:
      return "The Alms are not available to this account.";
  }
}
