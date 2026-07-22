import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

/* Flags actually read somewhere in the codebase. Everything else is a lever
   that does not yet move anything; the UI badges those so stewards know. */
const CONSUMED_FLAGS = new Set(["forge_staking"]);

const KEY_RE = /^[a-z0-9_]{2,48}$/;

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const { data, error } = await db
    .from("feature_flags")
    .select("key, enabled, note")
    .order("key", { ascending: true });
  if (error) return json({ error: "query_failed" }, 500);

  const flags = (data ?? []).map((f) => ({
    ...(f as { key: string; enabled: boolean; note: string | null }),
    consumed: CONSUMED_FLAGS.has((f as { key: string }).key),
  }));

  return json({ flags });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: { key?: unknown; enabled?: unknown; note?: unknown };
  try {
    body = (await req.json()) as {
      key?: unknown;
      enabled?: unknown;
      note?: unknown;
    };
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!KEY_RE.test(key)) return json({ error: "bad_key" }, 400);

  /* Upsert: create the flag if it does not exist, otherwise patch the fields
     provided. Registering a new rollout no longer needs direct DB access. */
  const { data: existing } = await db
    .from("feature_flags")
    .select("key, enabled, note")
    .eq("key", key)
    .maybeSingle();

  const row: { key: string; enabled: boolean; note: string | null } = {
    key,
    enabled:
      typeof body.enabled === "boolean"
        ? body.enabled
        : (existing?.enabled ?? false),
    note:
      typeof body.note === "string"
        ? body.note.trim().slice(0, 300) || null
        : (existing?.note ?? null),
  };

  const { data: updated, error } = await db
    .from("feature_flags")
    .upsert(row, { onConflict: "key" })
    .select("key, enabled, note")
    .maybeSingle();
  if (error) return json({ error: "update_failed" }, 500);
  if (!updated) return json({ error: "update_failed" }, 500);

  await logAdminAction(db, profile.id, existing ? "flag_update" : "flag_create", {
    targetType: "flag",
    targetId: key,
    payload: { enabled: row.enabled, note: row.note },
  });

  return json({
    ok: true,
    flag: { ...updated, consumed: CONSUMED_FLAGS.has(updated.key) },
  });
}
