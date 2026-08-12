import { json } from "@/lib/auth/server";
import { emit } from "@/lib/realm/events";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

const SEASON_SELECT = "id, name, starts_at, ends_at, status, vault_raven";

/* The realm calendar. GET lists every season; POST creates a new season or
   edits, activates, or closes an existing one. */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  /* Settlement view: the frozen standings for one settled season. */
  const settlementId = new URL(req.url).searchParams.get("settlement");
  if (settlementId) {
    const sid = Number(settlementId);
    if (!Number.isFinite(sid)) return json({ error: "bad_request" }, 400);
    const { data: rows, error: sErr } = await db
      .from("season_settlements")
      .select(
        "rank, points, renown, glory, settled_at, member:profiles!season_settlements_profile_id_fkey (handle, display_name, avatar_url)"
      )
      .eq("season_id", sid)
      .order("rank", { ascending: true })
      .limit(200);
    if (sErr) return json({ error: "query_failed" }, 500);
    const totalPoints = (rows ?? []).reduce(
      (sum, r) => sum + ((r.points as number) ?? 0),
      0
    );
    return json({ settlement: rows ?? [], totalPoints, count: (rows ?? []).length });
  }

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

  if (action === "settle") {
    // Freeze the season's final standings into points. Keep it entirely in
    // points; no $RSP is computed or surfaced. Idempotent per member via the
    // (season_id, profile_id) unique key.
    const { data: season } = await db
      .from("seasons")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!season) return json({ error: "not_found" }, 404);

    const { data: members, error: mErr } = await db
      .from("profiles")
      .select("id, points, renown, glory")
      .eq("is_banned", false)
      .eq("is_agent", false)
      .eq("onboarded", true)
      .order("points", { ascending: false })
      .order("renown", { ascending: false })
      .limit(5000);
    if (mErr) return json({ error: "query_failed" }, 500);

    const rows = (members ?? []).map((m, i) => ({
      season_id: id,
      profile_id: m.id as string,
      points: Math.max(0, Math.trunc((m.points as number) ?? 0)),
      renown: Math.max(0, Math.trunc((m.renown as number) ?? 0)),
      glory: Math.max(0, Math.trunc((m.glory as number) ?? 0)),
      rank: i + 1,
    }));

    if (rows.length > 0) {
      const { error: upErr } = await db
        .from("season_settlements")
        .upsert(rows, { onConflict: "season_id,profile_id" });
      if (upErr) return json({ error: "settle_failed" }, 500);
    }

    const { data: updated, error: stErr } = await db
      .from("seasons")
      .update({ status: "settled" })
      .eq("id", id)
      .select(SEASON_SELECT)
      .maybeSingle();
    if (stErr) return json({ error: "update_failed" }, 500);

    const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);

    /* The realm hears the season close. This is the one reward announcement
       the product can make honestly: the figures are server settled, frozen in
       season_settlements, and aggregate. A per member payout card is
       deliberately not emitted, because publishing one member's earned balance
       to the realm is a privacy decision nobody has made and rule 7 constrains
       how a balance may be shown at all.

       Once only, keyed on the season, so re-running a settlement to correct a
       row does not announce the same close twice. */
    await emit(db, {
      kind: "season.milestone",
      subjectType: "season",
      subjectId: `season:${id}:settled`,
      payload: {
        v: 1,
        phase: "settled",
        season_id: id,
        members: rows.length,
        total_points: totalPoints,
      },
    });

    await logAdminAction(db, profile.id, "season_settle", {
      targetType: "season",
      targetId: id,
      payload: { members: rows.length, totalPoints },
    });
    return json({
      ok: true,
      season: updated,
      settled: rows.length,
      totalPoints,
    });
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

    /* A world event: the realm's calendar turning, with no member behind it.
       This is the producer season.milestone has been missing since the spine
       was written, which is why the kind was defined and nothing drew it. */
    await emit(db, {
      kind: "season.milestone",
      subjectType: "season",
      subjectId: `season:${id}:${action === "activate" ? "opened" : "closed"}`,
      payload: {
        v: 1,
        phase: action === "activate" ? "opened" : "closed",
        season_id: id,
        name: (updated as { name?: string }).name ?? null,
        starts_at: (updated as { starts_at?: string }).starts_at ?? null,
        ends_at: (updated as { ends_at?: string }).ends_at ?? null,
      },
    });

    await logAdminAction(db, profile.id, `season_${action}`, {
      targetType: "season",
      targetId: id,
      payload: { status },
    });
    return json({ ok: true, season: updated });
  }

  return json({ error: "bad_request" }, 400);
}
