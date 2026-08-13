import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, ipKey } from "@/lib/rate-limit";
import { isDrawReference, type PublicOpening } from "@/lib/collectibles/verify";
import type { PulledCard } from "@/lib/collectibles/roll";

/* GET /api/chests/openings/[id]  the proof of one settled opening. Public.
 *
 * WHY THIS IS PUBLIC, WHICH IS THE WHOLE POINT OF MISSION 6.
 *
 * A member can already check their own chest: the opening response hands them
 * the revealed seed beside the hash that preceded it. That proves nothing about
 * the HOUSE. A provably fair scheme only constrains the house if somebody other
 * than the member can check a draw, because a realm that shows each member a
 * consistent story privately can still show every member a different one. So
 * anybody holding a draw reference can pull its proof, signed in or not.
 *
 * There is no secret being spent here. Once a chest is opened, its server seed
 * has been revealed to the member who opened it, its commitment is retired and
 * can never draw another chest, and the cards are already in a ledger. A
 * revealed seed is a published fact, not a credential.
 *
 * WHAT IS DELIBERATELY NOT HERE, and each omission is load bearing:
 *
 *   profile_id, and any route from an opening back to a member. The proof is
 *   public; who owns the cards is not. This endpoint can tell you that a
 *   Knight's Warchest dealt these five cards under this seed. It cannot tell
 *   you whose Hoard they landed in, and nothing here joins to profiles.
 *
 *   Unrevealed seeds. The query requires server_seed to be present, which is
 *   only ever true for a settled opening. `chest_seeds` is never read from this
 *   route at all, so a live commitment cannot leak through it. That is not a
 *   theoretical concern: a live seed in a response would let a member predict
 *   every chest still to come under it.
 *
 *   Anything about the member's other openings, entitlements or holdings.
 *
 * The entitlement id IS published, as the nonce, because the draw cannot be
 * rerun without it. It confers nothing: `chest_entitlements` is RLS denied, and
 * the opening route selects an entitlement by profile as well as by id, so
 * knowing the uuid of somebody else's spent entitlement buys an attacker
 * nothing. It is also already spent, permanently, by the time it appears here.
 *
 * The service role client is used because every table in this schema is RLS
 * deny by default (auth.uid() is always null under Privy). That makes the
 * projection below the security boundary, so it is written as an explicit
 * column list and never a select *. A `select *` here would ship profile_id the
 * first time somebody widened the table.
 */

export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";

/* Generous. Checking a proof is a read of a row that is public by design, and
   a sceptic auditing a run of openings by hand is exactly the behaviour this
   feature is for. The limit is here so the endpoint cannot be turned into a
   free uuid oracle at volume, not to ration honesty. */
const PROOF_LIMIT = 240;
const PROOF_WINDOW_SECONDS = 3600;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  /* Shape checked before the id reaches Postgres. A malformed uuid raises
     22P02 there, and a raw database error rendered at a member is useless to
     them and describes the query to anyone else. */
  if (!isDrawReference(id)) {
    return json({ error: "That is not a draw reference" }, 400);
  }

  const rl = await rateLimit(
    ipKey("chest-proof", req),
    PROOF_LIMIT,
    PROOF_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  try {
    const { data, error } = await db
      .from("chest_openings")
      .select(
        "id, chest_sku, result, server_seed_hash, server_seed, client_seed, entitlement_id, opened_at"
      )
      .eq("id", id.trim())
      /* Settled only. An opening without its seed published is not a proof and
         must not be served as one. */
      .not("server_seed", "is", null)
      .maybeSingle();

    if (error) return json({ error: "unavailable" }, 503);
    if (!data) {
      return json({ error: "No opening on the record under that reference" }, 404);
    }

    const result = (data.result ?? {}) as { cards?: PulledCard[] };
    const opening: PublicOpening = {
      id: data.id as string,
      chest_sku: data.chest_sku as string,
      opened_at: data.opened_at as string,
      cards: Array.isArray(result.cards) ? result.cards : [],
      proof: {
        server_seed_hash: data.server_seed_hash as string,
        server_seed: data.server_seed as string,
        /* The column is nullable and an empty client seed is legitimate: it
           means the member expressed no preference and the server seed carried
           the randomness. Null and empty must both rerun as empty, or the
           verifier would call those openings forged. */
        client_seed: (data.client_seed as string | null) ?? "",
        nonce: (data.entitlement_id as string | null) ?? "",
      },
    };

    return json({ opening });
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return json({ error: "The chests are not ready yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }
}
