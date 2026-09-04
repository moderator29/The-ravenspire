import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../../_admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { invalidateRoundState, weiFromNumeric } from "@/lib/season-zero/server";

/* POST /api/admin/season-zero/refund: record a refund that has already been sent.
 *
 * WHAT THIS DOES: marks one Season Zero contribution `refunded`, so the raise
 * stops counting it. The raise on every surface is a sum over rows with status
 * 'verified', so flipping this one status is the whole of the effect.
 *
 * WHAT THIS DOES NOT DO: move any money. There is no on-chain refund mechanism
 * here and there must not be one invented. The round is non-custodial: the ETH
 * sits in the treasury wallet, whose keys the platform does not hold, so a
 * refund is the founder sending it back to the sending wallet by hand from that
 * wallet. This route records that it happened, afterwards. A steward who calls
 * it before sending the ETH has written down something that is not true, and
 * nothing here can detect that, which is exactly why the surface in front of it
 * says so plainly rather than calling the control "Refund".
 *
 * This is the softcap promise being kept: if the round closes below the softcap
 * every contribution goes back to the wallet that sent it, and this is the
 * record of each one going.
 *
 * IDEMPOTENT, AND IT REFUSES RATHER THAN CRASHING. A row already marked
 * refunded is answered 409 `already_refunded`, and the write itself is
 * conditional on the row still being verified, so two stewards clicking at once
 * cannot both be told they were the one who did it.
 *
 * The refund transaction hash is optional and is recorded in the audit log
 * rather than on the contribution: the table has no column for it, and adding
 * one is a migration this route is not entitled to make. The audit entry is the
 * durable link between the row and the transaction that returned the money.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH = /^0x[0-9a-f]{64}$/i;

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  const rl = await rateLimit(
    profileKey("admin-season-zero-refund", profile.id),
    60,
    3600
  );
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  let body: { id?: unknown; refundTxHash?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID.test(id)) return json({ error: "bad_request" }, 400);

  /* Optional, and strict when given: a hash that is nearly a hash is worse than
     none, because it will be read later as the proof the money went back. */
  let refundTxHash: string | null = null;
  if (body.refundTxHash !== undefined && body.refundTxHash !== null && body.refundTxHash !== "") {
    if (typeof body.refundTxHash !== "string" || !TX_HASH.test(body.refundTxHash.trim())) {
      return json({ error: "bad_refund_tx_hash" }, 400);
    }
    refundTxHash = body.refundTxHash.trim().toLowerCase();
  }

  const found = await db
    .from("season_zero_contributions")
    .select("id, user_id, chain_id, tx_hash, amount_wei, status")
    .eq("id", id)
    .maybeSingle();
  if (found.error) {
    if (found.error.code === "42P01") {
      return json({ error: "season zero is not migrated yet" }, 503);
    }
    return json({ error: "query_failed" }, 500);
  }
  const row = found.data as
    | {
        id: string;
        user_id: string | null;
        chain_id: number | null;
        tx_hash: string | null;
        amount_wei: unknown;
        status: string | null;
      }
    | null;
  if (!row) return json({ error: "contribution_not_found" }, 404);
  if (row.status === "refunded") return json({ error: "already_refunded" }, 409);

  /* Conditional on the row still being verified, so the check above and the
     write below cannot be split by a second steward. */
  const updated = await db
    .from("season_zero_contributions")
    .update({ status: "refunded" })
    .eq("id", id)
    .eq("status", "verified")
    .select("id")
    .maybeSingle();
  if (updated.error) return json({ error: "refund_failed" }, 500);
  if (!updated.data) return json({ error: "already_refunded" }, 409);

  await logAdminAction(db, profile.id, "season_zero_refund", {
    targetType: "season_zero_contribution",
    targetId: id,
    payload: {
      user_id: row.user_id,
      chain_id: row.chain_id,
      tx_hash: row.tx_hash,
      amount_wei: weiFromNumeric(row.amount_wei).toString(),
      refund_tx_hash: refundTxHash,
      /* Said in the record itself, not only in this file: the platform moved
         nothing, it wrote down that the founder did. */
      note: "records a refund sent by hand from the treasury wallet",
    },
  });

  /* The public raise bar excludes this row from its next read rather than up to
     thirty seconds later. */
  invalidateRoundState();

  return json({ ok: true, id, status: "refunded", refundTxHash });
}
