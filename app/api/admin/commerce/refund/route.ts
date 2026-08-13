import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../../_admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { paymentProvider } from "@/lib/commerce/payments";
import { logger } from "@/lib/observability/log";

/* POST /api/admin/commerce/refund (V2 Part Three, section 38).
 *
 * The admin-initiated refund path. Server-authoritative and idempotent: it moves
 * the money at the provider (unless the admin is recording a refund they already
 * issued by hand), then records the reversal and withdraws the unopened digital
 * entitlements from the order through the refund_order RPC.
 *
 * NEVER CLAWS BACK AN OPENED PULL. refund_order only removes entitlements the
 * member has not opened; an opened chest is a real card they hold and is left
 * alone. The count of already-opened chests is returned so the operator can
 * settle the difference out of band rather than the platform hiding it.
 *
 * IDEMPOTENT AT TWO LAYERS. The provider refund is keyed by the order, so a
 * retried call issues no second reversal, and refund_order acts only on an order
 * that is still paid or fulfilled, so a repeat records nothing new.
 *
 * move_money defaults to true: the common case is the platform issuing the
 * refund. Pass move_money:false when the refund was already made in the provider
 * dashboard and this call only needs to record it and reverse the entitlements.
 */

export const dynamic = "force-dynamic";

const log = logger("commerce.admin.refund");

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  const rl = await rateLimit(profileKey("admin-refund", profile.id), 60, 3600);
  if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  let body: { order_id?: unknown; reason?: unknown; move_money?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const orderId = typeof body.order_id === "string" ? body.order_id : "";
  if (!orderId) return json({ error: "order_id is required" }, 400);
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 200)
      : "admin_refund";
  const moveMoney = body.move_money !== false;

  const orderRes = await db
    .from("orders")
    .select("id, status, provider, provider_session_id, total_minor")
    .eq("id", orderId)
    .maybeSingle();
  if (orderRes.error) {
    if (orderRes.error.code === "42P01" || orderRes.error.code === "42703") {
      return json({ error: "commerce is not migrated yet" }, 503);
    }
    log.error("order lookup failed", { orderId, err: orderRes.error });
    return json({ error: "unavailable" }, 503);
  }
  const order = orderRes.data as
    | {
        id: string;
        status: string;
        provider: string | null;
        provider_session_id: string | null;
        total_minor: number | null;
      }
    | null;
  if (!order) return json({ error: "order_not_found" }, 404);
  if (order.status === "refunded") {
    return json({ error: "already_refunded" }, 409);
  }
  if (order.status !== "paid" && order.status !== "fulfilled") {
    return json({ error: "not_refundable", status: order.status }, 409);
  }

  const provider = paymentProvider();
  let providerRef: string | null = null;
  let amountMinor: number | null = order.total_minor;

  if (moveMoney) {
    if (!provider.isConfigured()) {
      return json({ error: "Payments are not configured" }, 503);
    }
    try {
      const refunded = await provider.refund({
        orderId: order.id,
        sessionRef: order.provider_session_id,
      });
      providerRef = refunded.providerRef;
      if (refunded.amountMinor != null) amountMinor = refunded.amountMinor;
    } catch (err) {
      /* The money did not move, so nothing is recorded: the order stays paid
         and the admin can retry. */
      log.error("provider refund failed", { orderId, err });
      return json({ error: "refund_failed" }, 502);
    }
  }

  /* Record the refund and reverse the unopened entitlements, idempotently. */
  const { data, error } = await db.rpc("refund_order", {
    p_order_id: order.id,
    p_provider: order.provider ?? provider.name,
    p_provider_ref: providerRef,
    p_amount_minor: amountMinor,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "42883") return json({ error: "not migrated" }, 503);
    log.error("refund_order failed", { orderId, err: error });
    return json({ error: "unavailable" }, 503);
  }
  const result = (data ?? {}) as {
    refunded?: boolean;
    reversed?: number;
    already_opened?: number;
    reason?: string;
  };

  await logAdminAction(db, profile.id, "order_refund", {
    targetType: "order",
    targetId: order.id,
    payload: {
      moved_money: moveMoney,
      reversed: result.reversed ?? 0,
      already_opened: result.already_opened ?? 0,
      reason,
    },
  });

  return json({ ok: true, ...result });
}
