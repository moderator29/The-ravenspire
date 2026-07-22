import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

const USER_SELECT =
  "id, handle, display_name, tier, renown, points, house_slug, is_admin, is_banned, is_verified, created_at";

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const cursor = url.searchParams.get("cursor")?.trim() ?? "";

  let query = db
    .from("profiles")
    .select(USER_SELECT)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (q) {
    /* Escape the ilike wildcards so a literal % or _ in a handle search does
       not match everything. */
    const safe = q.replace(/[%_,]/g, (m) => `\\${m}`);
    query = query.or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`);
  }
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) return json({ error: "query_failed" }, 500);

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const users = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore
    ? (users[users.length - 1] as { created_at: string }).created_at
    : null;

  return json({ users, nextCursor });
}

/* Each action is an explicit, idempotent set-to-a-known-value write, never a
   read-then-negate toggle, so concurrent or retried requests cannot silently
   flip a seat or a ban twice. */
const ACTIONS: Record<
  string,
  { column: "is_admin" | "is_banned" | "is_verified"; value: boolean }
> = {
  grant_admin: { column: "is_admin", value: true },
  revoke_admin: { column: "is_admin", value: false },
  ban_user: { column: "is_banned", value: true },
  unban_user: { column: "is_banned", value: false },
  verify_user: { column: "is_verified", value: true },
  unverify_user: { column: "is_verified", value: false },
};

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: { profile_id?: string; action?: string };
  try {
    body = (await req.json()) as { profile_id?: string; action?: string };
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action ?? "";
  const spec = ACTIONS[action];
  if (!spec || !body.profile_id) {
    return json({ error: "bad_request" }, 400);
  }

  /* A steward can neither drop their own seat nor ban themselves. */
  if (
    body.profile_id === profile.id &&
    (spec.column === "is_admin" || spec.column === "is_banned")
  ) {
    return json({ error: "cannot_change_own_seat" }, 400);
  }

  const { data: target } = await db
    .from("profiles")
    .select("id, handle, is_admin, is_banned, is_verified")
    .eq("id", body.profile_id)
    .maybeSingle();
  if (!target) return json({ error: "not_found" }, 404);

  const { data: updated, error } = await db
    .from("profiles")
    .update({ [spec.column]: spec.value })
    .eq("id", target.id)
    .select(USER_SELECT)
    .single();
  if (error) return json({ error: "update_failed" }, 500);

  await logAdminAction(db, profile.id, action, {
    targetType: "profile",
    targetId: target.id,
    payload: { handle: target.handle, [spec.column]: spec.value },
  });

  return json({ ok: true, user: updated });
}
