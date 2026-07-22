import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

type ReportRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  reporter: { handle: string | null; display_name: string | null } | null;
  resolver: { handle: string | null; display_name: string | null } | null;
};

const VALID_STATUS = new Set(["open", "resolved", "dismissed", "all"]);

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status")?.trim() || "open";
  const status = VALID_STATUS.has(statusParam) ? statusParam : "open";

  let query = db
    .from("reports")
    .select(
      "id, subject_type, subject_id, reason, status, created_at, resolved_at, resolution_note, reporter:reporter_id (handle, display_name), resolver:resolved_by (handle, display_name)"
    )
    .order("created_at", { ascending: status === "open" })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return json({ error: "query_failed" }, 500);
  const reports = (data ?? []) as unknown as ReportRow[];

  /* Hydrate each report's subject so the council can judge without a manual DB
     query. Batch by subject_type; polymorphic subjects cannot be joined in one
     select. */
  const byType: Record<string, string[]> = {};
  for (const r of reports) {
    (byType[r.subject_type] ??= []).push(r.subject_id);
  }

  const subjects: Record<string, Record<string, unknown>> = {};
  const attach = (type: string, id: string, value: Record<string, unknown>) => {
    subjects[`${type}:${id}`] = value;
  };

  if (byType.post?.length) {
    const { data: posts } = await db
      .from("posts")
      .select(
        "id, body, kind, deleted, created_at, author:author_id (handle, display_name)"
      )
      .in("id", byType.post);
    for (const p of posts ?? []) {
      const row = p as Record<string, unknown>;
      attach("post", row.id as string, row);
    }
  }
  if (byType.comment?.length) {
    const { data: comments } = await db
      .from("comments")
      .select(
        "id, body, deleted, post_id, created_at, author:author_id (handle, display_name)"
      )
      .in("id", byType.comment);
    for (const c of comments ?? []) {
      const row = c as Record<string, unknown>;
      attach("comment", row.id as string, row);
    }
  }
  const profileTypes = [
    ...(byType.profile ?? []),
    ...(byType.user ?? []),
  ];
  if (profileTypes.length) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, handle, display_name, bio, is_banned, is_verified")
      .in("id", profileTypes);
    for (const pr of profiles ?? []) {
      const row = pr as Record<string, unknown>;
      attach("profile", row.id as string, row);
      attach("user", row.id as string, row);
    }
  }

  const hydrated = reports.map((r) => ({
    ...r,
    subject: subjects[`${r.subject_type}:${r.subject_id}`] ?? null,
  }));

  return json({ reports: hydrated, status });
}

const CLOSE_ACTIONS = new Set(["resolve", "dismiss", "takedown"]);

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: { report_id?: string; action?: string; note?: string };
  try {
    body = (await req.json()) as {
      report_id?: string;
      action?: string;
      note?: string;
    };
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action ?? "";
  if (!body.report_id || (!CLOSE_ACTIONS.has(action) && action !== "reopen")) {
    return json({ error: "bad_request" }, 400);
  }
  const note = body.note?.trim().slice(0, 500) || null;

  /* Reopen: an undo path so a misclicked dismiss is not final. */
  if (action === "reopen") {
    const { data: updated, error } = await db
      .from("reports")
      .update({
        status: "open",
        resolved_by: null,
        resolved_at: null,
        resolution_note: null,
      })
      .eq("id", body.report_id)
      .select("id, status")
      .maybeSingle();
    if (error) return json({ error: "update_failed" }, 500);
    if (!updated) return json({ error: "not_found" }, 404);
    await logAdminAction(db, profile.id, "report_reopen", {
      targetType: "report",
      targetId: body.report_id,
    });
    return json({ ok: true, report: updated });
  }

  /* Load the report so a takedown knows what content to remove. */
  const { data: report } = await db
    .from("reports")
    .select("id, subject_type, subject_id, status")
    .eq("id", body.report_id)
    .maybeSingle();
  if (!report) return json({ error: "not_found" }, 404);

  let takedownTarget: { type: string; id: string } | null = null;
  if (action === "takedown") {
    if (report.subject_type === "post") {
      const { error: delErr } = await db
        .from("posts")
        .update({ deleted: true })
        .eq("id", report.subject_id);
      if (delErr) return json({ error: "takedown_failed" }, 500);
      takedownTarget = { type: "post", id: report.subject_id };
    } else if (report.subject_type === "comment") {
      const { error: delErr } = await db
        .from("comments")
        .update({ deleted: true })
        .eq("id", report.subject_id);
      if (delErr) return json({ error: "takedown_failed" }, 500);
      takedownTarget = { type: "comment", id: report.subject_id };
    } else {
      return json({ error: "takedown_not_supported" }, 400);
    }
  }

  const nextStatus = action === "dismiss" ? "dismissed" : "resolved";
  const { data: updated, error } = await db
    .from("reports")
    .update({
      status: nextStatus,
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note,
    })
    .eq("id", body.report_id)
    .eq("status", "open")
    .select("id, status")
    .maybeSingle();
  if (error) return json({ error: "update_failed" }, 500);
  if (!updated) return json({ error: "not_found" }, 404);

  await logAdminAction(db, profile.id, `report_${action}`, {
    targetType: "report",
    targetId: report.id,
    payload: {
      subject_type: report.subject_type,
      subject_id: report.subject_id,
      note,
      takedown: takedownTarget,
    },
  });

  return json({ ok: true, report: updated, takedown: takedownTarget });
}
