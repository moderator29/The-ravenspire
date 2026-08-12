import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

/* The launch switches (V2 Part Two, section 27.1).
 *
 * realm_flags is a different instrument from feature_flags and gets its own
 * route on purpose. feature_flags is the open lever room: admins register
 * keys freely and annotate them. realm_flags is the set of launch switches
 * for the sealed chapters, seeded by migration (reliquary_live, chests_live,
 * mercer_live), read by lib/flags.ts on every gated surface. So this route
 * can toggle an existing switch and do nothing else: a switch is born in a
 * migration next to the surface it unseals, never typed into a panel, and a
 * typo here must be impossible because flipping one of these IS the launch.
 *
 * The migration may not be applied yet (the foundation commit wrote it
 * without applying it), so a missing table (42P01) is an expected state:
 * GET reports it as migrated:false and POST answers 503 with a clear body.
 */

const UNDEFINED_TABLE = "42P01";

type FlagRow = { key: string; enabled: boolean; updated_at: string };

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const { data, error } = await db
    .from("realm_flags")
    .select("key, enabled, updated_at")
    .order("key", { ascending: true });
  if (error) {
    if (error.code === UNDEFINED_TABLE) return json({ flags: [], migrated: false });
    return json({ error: "query_failed" }, 500);
  }
  return json({ flags: (data ?? []) as FlagRow[], migrated: true });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: { key?: unknown; enabled?: unknown };
  try {
    body = (await req.json()) as { key?: unknown; enabled?: unknown };
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key || typeof body.enabled !== "boolean") {
    return json({ error: "bad_request" }, 400);
  }

  /* Update only. No upsert: an unknown key is a 404, never a new switch. */
  const { data: updated, error } = await db
    .from("realm_flags")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select("key, enabled, updated_at")
    .maybeSingle();
  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return json(
        { error: "The launch switches are not migrated yet" },
        503
      );
    }
    return json({ error: "update_failed" }, 500);
  }
  if (!updated) return json({ error: "unknown_flag" }, 404);

  /* Flipping a launch switch is the most consequential admin act there is;
     it always leaves a trail. */
  await logAdminAction(db, profile.id, "realm_flag_update", {
    targetType: "realm_flag",
    targetId: key,
    payload: { enabled: body.enabled },
  });

  return json({ ok: true, flag: updated as FlagRow });
}
