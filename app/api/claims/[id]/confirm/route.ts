import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import {
  CLAIM_COLUMNS,
  TX_HASH_RE,
  mintGate,
  type ClaimRow,
} from "@/lib/collectibles/claims";
import { verifyMint } from "@/lib/chain/verify-mint";

/* POST /api/claims/[id]/confirm
 *
 * The member's wallet has broadcast the mint and hands back a transaction
 * hash. That hash is the entire extent of what the client is allowed to
 * assert. Everything else is read from the chain in verifyMint: that the
 * transaction exists and succeeded, that it was sent by that member's own
 * wallet, that it reached our contract, and that it minted that exact token to
 * them. Only then does the claim become minted.
 *
 * This is AGENTS.md rule 8 (server-authoritative, never trust the client)
 * applied to the one part of the product whose source of truth is not this
 * database. The attack it closes is cheap to attempt: post any hash at all, or
 * somebody else's real mint, and have the realm mark a claim settled.
 *
 * Three outcomes, and they are honestly different:
 *   200 { status: "minted" }   read from the chain, settled, final
 *   202 { status: "pending" }  not settled yet, ask again shortly
 *   400 { error }              settled as wrong, and asking again will not
 *                              change the answer
 */

export const dynamic = "force-dynamic";

/* Polling a pending mint is the normal case, so the window is wide enough to
   poll every few seconds for several minutes and still leave room for a second
   attempt on a bad day. */
const CONFIRM_LIMIT = 240;
const CONFIRM_WINDOW_SECONDS = 3600;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const gate = await mintGate();
  if (!gate.open) return json({ error: gate.reason }, gate.status);

  const rl = await rateLimit(
    profileKey("claim-confirm", profile.id),
    CONFIRM_LIMIT,
    CONFIRM_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    tx_hash?: unknown;
  } | null;
  const txHash =
    typeof body?.tx_hash === "string" ? body.tx_hash.trim().toLowerCase() : null;
  if (!txHash || !TX_HASH_RE.test(txHash)) {
    return json({ error: "bad transaction hash" }, 400);
  }

  /* Scoped to the caller. Somebody else's claim reads as not found, which is
     also the truth from where they stand. */
  const { data: claimRow, error: readError } = await db
    .from("collectible_claims")
    .select(CLAIM_COLUMNS)
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (readError) return json({ error: "unavailable" }, 503);
  if (!claimRow) return json({ error: "No such claim" }, 404);
  const claim = claimRow as ClaimRow;

  /* Already settled. Idempotent rather than an error: a member who taps twice,
     or whose success screen reloads, should meet the good news again. */
  if (claim.status === "minted") {
    return json({ status: "minted", claim });
  }
  if (claim.status !== "issued" && claim.status !== "submitted") {
    return json({ error: "That claim is no longer open" }, 409);
  }

  /* One transaction settles one claim, enforced by a partial unique index. A
     hash already spent on another claim is either a mistake or an attempt to
     settle two claims with one mint, and both get the same answer. */
  const { data: elsewhere } = await db
    .from("collectible_claims")
    .select("id")
    .eq("tx_hash", txHash)
    .neq("id", claim.id)
    .maybeSingle();
  if (elsewhere) {
    return json({ error: "That transaction already settled another claim" }, 409);
  }

  const verdict = await verifyMint({
    config: gate.config,
    txHash: txHash as `0x${string}`,
    wallet: claim.wallet_address,
    contract: claim.contract,
    tokenId: claim.token_id,
    amount: 1,
  });

  if (!verdict.ok && verdict.pending) {
    /* Remember the hash so a later poll, a refresh, or a support question all
       land on the same transaction. Written only in the pending and settled
       cases: persisting a hash we have proven wrong would leave it occupying
       the unique index and blocking the real one. */
    await db
      .from("collectible_claims")
      .update({
        status: "submitted",
        tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id)
      .in("status", ["issued", "submitted"]);
    return json({ status: "pending", reason: verdict.reason }, 202);
  }

  if (!verdict.ok) {
    /* Settled as wrong. If the voucher's own deadline has also passed there is
       nothing left to wait for, so the claim is closed and the holding is free
       to be claimed again with a fresh voucher. */
    if (new Date(claim.expires_at).getTime() < Date.now()) {
      await db
        .from("collectible_claims")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", claim.id)
        .in("status", ["issued", "submitted"]);
    }
    return json({ error: verdict.reason }, 400);
  }

  /* The chain says it happened. The status guard is what makes this safe to
     race: only a claim still open can become minted, so a second confirm
     arriving at the same moment updates nothing and reads back the settled
     row rather than writing a second settlement. */
  const { data: settled, error: settleError } = await db
    .from("collectible_claims")
    .update({
      status: "minted",
      tx_hash: txHash,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id)
    .in("status", ["issued", "submitted"])
    .select(CLAIM_COLUMNS)
    .maybeSingle();

  if (settleError) return json({ error: "unavailable" }, 503);

  if (!settled) {
    /* The guard did not match, which means another request settled it first.
       Read it back and answer with the truth. */
    const { data: current } = await db
      .from("collectible_claims")
      .select(CLAIM_COLUMNS)
      .eq("id", claim.id)
      .maybeSingle();
    return json({ status: "minted", claim: (current as ClaimRow) ?? claim });
  }

  return json({ status: "minted", claim: settled as ClaimRow });
}
