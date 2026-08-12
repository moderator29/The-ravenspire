import { getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { mintGate } from "@/lib/collectibles/claims";
import { EMPTY_HOARD, readHoard } from "@/lib/collectibles/hoard";

/* GET /api/inventory: the caller's own Hoard.
 *
 * The trophy case, from the owner's side, which is the side that can act:
 * every copy carries its claim state so the surface can offer to carry it to
 * the member's own wallet. Somebody else's collection is /api/hoard, and both
 * shape their cards through lib/collectibles/hoard.ts so the two can never
 * disagree about what a holding is.
 *
 * The mint's state travels with the list because a claim control that renders
 * before the realm knows whether it can mint is a control that promises
 * something it cannot do.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. A signed-out
     caller holds nothing, which is both the safe answer and the true one. */
  const profile = await getProfile(req);
  const gate = await mintGate();
  /* What the client is told about the mint: whether it is open, and on which
     chain, so a claim button can render honestly. Never the contracts and
     never anything derived from the signing key. */
  const mint = gate.open
    ? {
        open: true,
        chain: { id: gate.config.chain.id, name: gate.config.chain.name },
        explorer: gate.config.chain.explorer,
      }
    : { open: false, reason: gate.reason };

  if (!profile) return json({ ...EMPTY_HOARD, mint });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  try {
    const hoard = await readHoard(db, profile.id);
    return json({ ...hoard, mint });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
