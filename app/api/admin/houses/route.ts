import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

const HOUSE_SELECT = "slug, name, motto, sigil, color, member_count, glory";

/* The great houses. GET returns each house with its membership and glory.
   POST edits a house's name/motto or adjusts its glory (with a reason written
   to both the points ledger and the audit log). */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const { data, error } = await db
    .from("houses")
    .select(HOUSE_SELECT)
    .order("glory", { ascending: false });
  if (error) return json({ error: "query_failed" }, 500);

  return json({ houses: data ?? [] });
}

/* Bound on a single glory adjustment. Generous enough to revert an exploit,
   small enough that a typo cannot rewrite the standings. */
const MAX_DELTA = 1_000_000;

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: {
    action?: string;
    slug?: unknown;
    name?: unknown;
    motto?: unknown;
    glory_delta?: unknown;
    reason?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action ?? "adjust_glory";
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!slug) return json({ error: "bad_request" }, 400);

  const { data: house, error: readErr } = await db
    .from("houses")
    .select("slug, glory")
    .eq("slug", slug)
    .maybeSingle();
  if (readErr) return json({ error: "query_failed" }, 500);
  if (!house) return json({ error: "not_found" }, 404);

  if (action === "edit") {
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim().slice(0, 120);
    if (typeof body.motto === "string") patch.motto = body.motto.trim().slice(0, 200);
    if (Object.keys(patch).length === 0)
      return json({ error: "bad_request" }, 400);

    const { data: updated, error } = await db
      .from("houses")
      .update(patch)
      .eq("slug", slug)
      .select(HOUSE_SELECT)
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);

    await logAdminAction(db, profile.id, "house_edit", {
      targetType: "house",
      targetId: slug,
      payload: patch,
    });
    return json({ ok: true, house: updated });
  }

  if (action === "adjust_glory") {
    const raw =
      typeof body.glory_delta === "number"
        ? body.glory_delta
        : typeof body.glory_delta === "string"
          ? Number(body.glory_delta)
          : NaN;
    if (!Number.isFinite(raw) || raw === 0)
      return json({ error: "bad_request" }, 400);

    const delta = Math.trunc(raw);
    if (Math.abs(delta) > MAX_DELTA)
      return json({ error: "delta_too_large", max: MAX_DELTA }, 400);

    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 300)
        : "admin adjustment";
    const nextGlory = Math.max(0, (house.glory ?? 0) + delta);

    const { data: updated, error } = await db
      .from("houses")
      .update({ glory: nextGlory })
      .eq("slug", slug)
      .select(HOUSE_SELECT)
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);

    /* Trace the adjustment in the ledger. glory_delta is left at 0 so a totals
       reconciliation never mis-attributes house glory to the acting steward;
       the delta and target live in the reason string and the audit payload. */
    await db.from("points_ledger").insert({
      profile_id: profile.id,
      points_delta: 0,
      glory_delta: 0,
      reason: `admin_house_glory:${slug}:${delta > 0 ? "+" : ""}${delta}:${reason}`,
      ref: null,
    });

    await logAdminAction(db, profile.id, "house_glory_adjust", {
      targetType: "house",
      targetId: slug,
      payload: { delta, reason, before: house.glory ?? 0, after: nextGlory },
    });

    return json({ ok: true, house: updated, applied: delta });
  }

  return json({ error: "bad_request" }, 400);
}
