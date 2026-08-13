import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../../_admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { setOneCards } from "@/lib/collectibles/set-one";
import { generateCode, hashCode } from "@/lib/commerce/redemption";
import { logger } from "@/lib/observability/log";

/* POST /api/admin/commerce/redemption (V2 Part Three, section 38).
 *
 * Mint one single-use redemption code. This is the admin side of the physical
 * to digital bridge: a King's Reliquary ships with a printed code, and this is
 * where that code is created. It generates a code, stores only its hash plus the
 * exact cards it grants and the chest sku it belongs to, and returns the
 * plaintext code ONCE. The plaintext is never stored and never returned again;
 * lose it and the code has to be reissued.
 *
 * REAL DATA ONLY. The granted cards are validated against the real Set One
 * catalog: every card must be a real collector number whose slug and rarity
 * match the printed set. A grant naming a card that does not exist, or a rarity
 * the card does not have, is rejected rather than stored, so a redemption can
 * only ever mint a real card.
 *
 * The code is a bearer secret, so it is treated like a password: hashed with
 * lib/commerce/redemption (sha256 of the normalised code), and the code_hash
 * column is unique, which is single-use and replay resistance at the database.
 * On the astronomically unlikely hash collision the insert conflicts and we
 * generate a fresh code and retry.
 */

export const dynamic = "force-dynamic";

const log = logger("commerce.admin.redemption");

interface CardGrant {
  number: number;
  slug: string;
  rarity: string;
}

/* Validate one requested card against the real Set One catalog. Returns the
   canonical card (number, slug, rarity from the catalog, never the caller's) or
   null when it names no real card or the wrong rarity for that card. */
function resolveCard(raw: unknown): CardGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as { number?: unknown; slug?: unknown; rarity?: unknown };
  const number = typeof c.number === "number" ? c.number : NaN;
  const card = setOneCards.find((sc) => sc.number === number);
  if (!card) return null;
  /* The slug and rarity must match the catalog card, when given. We store the
     catalog's own values regardless, so a mismatched request is rejected rather
     than silently corrected. */
  if (typeof c.slug === "string" && c.slug !== card.champion.slug) return null;
  if (typeof c.rarity === "string" && c.rarity !== card.champion.rarity) {
    return null;
  }
  return {
    number: card.number,
    slug: card.champion.slug,
    rarity: card.champion.rarity,
  };
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  const rl = await rateLimit(profileKey("admin-redemption", profile.id), 60, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  let body: { chest_sku?: unknown; cards?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const chestSku = typeof body.chest_sku === "string" ? body.chest_sku : "";
  const tier = CHEST_TIERS.find((t) => t.sku === chestSku);
  if (!tier) return json({ error: "unknown_chest" }, 400);

  if (!Array.isArray(body.cards) || body.cards.length === 0) {
    return json({ error: "a redemption must grant at least one card" }, 400);
  }
  const cards: CardGrant[] = [];
  for (const raw of body.cards) {
    const card = resolveCard(raw);
    if (!card) {
      return json({ error: "a grant names a card that is not in Set One" }, 400);
    }
    cards.push(card);
  }

  const grants = { cards };

  /* Insert with a fresh code, retrying on the vanishingly rare hash collision.
     The plaintext lives only in this function and only long enough to return
     it. */
  const MAX_TRIES = 5;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const code = generateCode();
    const codeHash = hashCode(code);
    const insert = await db
      .from("redemptions")
      .insert({ code_hash: codeHash, chest_sku: chestSku, grants })
      .select("id")
      .single();

    if (!insert.error && insert.data) {
      const redemptionId = insert.data.id as string;
      await logAdminAction(db, profile.id, "redemption_create", {
        targetType: "redemption",
        targetId: redemptionId,
        /* The code itself is never logged: the audit records what was granted,
           not the bearer secret. */
        payload: { chest_sku: chestSku, cards: cards.length },
      });
      return json({
        ok: true,
        code,
        redemptionId,
        chest_sku: chestSku,
        cards,
      });
    }

    if (insert.error?.code === "23505") {
      /* Hash collision on code_hash. Generate a new code and try again. */
      continue;
    }
    if (insert.error?.code === "42P01" || insert.error?.code === "42703") {
      return json({ error: "commerce is not migrated yet" }, 503);
    }
    log.error("redemption insert failed", {
      adminId: profile.id,
      chestSku,
      err: insert.error,
    });
    return json({ error: "unavailable" }, 503);
  }

  /* Five collisions in a row on a 98-bit space does not happen; if it somehow
     did, fail honestly rather than loop forever. */
  return json({ error: "could not allocate a unique code" }, 503);
}
