import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

const SEASON_SELECT = "id, name, starts_at, ends_at, status, vault_raven";

/* The realm calendar. GET lists every season; POST creates a new season or
   edits, activates, or closes an existing one. */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const { data, error } = await db
    .from("seasons")
    .select(SEASON_SELECT)
    .order("id", { ascending: true });
  if (error) return json({ error: "query_failed" }, 500);

  return json({ seasons: data ?? [] });
}

function toIso(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toId(v: unknown): number {
  return typeof v === "number"
    ? v
    : typeof v === "string"
      ? Number(v)
      : NaN;
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: {
    action?: string;
    id?: unknown;
    name?: unknown;
    starts_at?: unknown;
    ends_at?: unknown;
    vault_raven?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action ?? "";

  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "bad_request" }, 400);

    /* seasons.id has no default; take the next integer after the highest. */
    const { data: last } = await db
      .from("seasons")
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextId = ((last?.id as number | undefined) ?? 0) + 1;

    const vault =
      body.vault_raven == null || body.vault_raven === ""
        ? 0
        : Math.max(0, Math.trunc(Number(body.vault_raven)));

    const { data: created, error } = await db
      .from("seasons")
      .insert({
        id: nextId,
        name,
        starts_at: toIso(body.starts_at),
        ends_at: toIso(body.ends_at),
        status: "upcoming",
        vault_raven: Number.isFinite(vault) ? vault : 0,
      })
      .select(SEASON_SELECT)
      .single();
    if (error) return json({ error: "create_failed" }, 500);

    await logAdminAction(db, profile.id, "season_create", {
      targetType: "season",
      targetId: nextId,
      payload: { name },
    });
    return json({ ok: true, season: created });
  }

  const id = toId(body.id);
  if (!Number.isFinite(id)) return json({ error: "bad_request" }, 400);

  if (action === "edit") {
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim())
      patch.name = body.name.trim();
    if ("starts_at" in body) patch.starts_at = toIso(body.starts_at);
    if ("ends_at" in body) patch.ends_at = toIso(body.ends_at);
    if (body.vault_raven != null && body.vault_raven !== "") {
      const v = Math.trunc(Number(body.vault_raven));
      if (Number.isFinite(v)) patch.vault_raven = Math.max(0, v);
    }
    if (Object.keys(patch).length === 0)
      return json({ error: "bad_request" }, 400);

    const { data: updated, error } = await db
      .from("seasons")
      .update(patch)
      .eq("id", id)
      .select(SEASON_SELECT)
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);

    await logAdminAction(db, profile.id, "season_edit", {
      targetType: "season",
      targetId: id,
      payload: patch,
    });
    return json({ ok: true, season: updated });
  }

  if (action === "activate" || action === "close") {
    const status = action === "activate" ? "active" : "closed";
    const { data: updated, error } = await db
      .from("seasons")
      .update({ status })
      .eq("id", id)
      .select(SEASON_SELECT)
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);

    await logAdminAction(db, profile.id, `season_${action}`, {
      targetType: "season",
      targetId: id,
      payload: { status },
    });
    return json({ ok: true, season: updated });
  }

  return json({ error: "bad_request" }, 400);
}
