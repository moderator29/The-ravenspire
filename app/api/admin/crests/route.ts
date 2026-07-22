import { json } from "@/lib/auth/server";
import { requireAdmin, isResponse, logAdminAction } from "../_admin";

/* The honor roll. GET returns how many citizens hold each crest. POST grants
   or revokes a crest for a named member. */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db } = ctx;

  const { data, error } = await db.from("user_crests").select("crest_slug");
  if (error) return json({ error: "query_failed" }, 500);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const slug = (row as { crest_slug: string | null }).crest_slug;
    if (!slug) continue;
    counts[slug] = (counts[slug] ?? 0) + 1;
  }

  return json({ counts, total: (data ?? []).length });
}

async function resolveProfile(
  db: import("@supabase/supabase-js").SupabaseClient,
  body: { profile_id?: unknown; handle?: unknown }
): Promise<{ id: string; handle: string | null } | null> {
  if (typeof body.profile_id === "string" && body.profile_id) {
    const { data } = await db
      .from("profiles")
      .select("id, handle")
      .eq("id", body.profile_id)
      .maybeSingle();
    return data ?? null;
  }
  if (typeof body.handle === "string" && body.handle.trim()) {
    const handle = body.handle.trim().replace(/^@/, "");
    const { data } = await db
      .from("profiles")
      .select("id, handle")
      .eq("handle", handle)
      .maybeSingle();
    return data ?? null;
  }
  return null;
}

export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (isResponse(ctx)) return ctx;
  const { db, profile } = ctx;

  let body: {
    action?: string;
    crest_slug?: unknown;
    profile_id?: unknown;
    handle?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const action = body.action ?? "";
  const crestSlug =
    typeof body.crest_slug === "string" ? body.crest_slug.trim() : "";
  if ((action !== "grant" && action !== "revoke") || !crestSlug) {
    return json({ error: "bad_request" }, 400);
  }

  const target = await resolveProfile(db, body);
  if (!target) return json({ error: "member_not_found" }, 404);

  if (action === "grant") {
    const { error } = await db
      .from("user_crests")
      .upsert(
        { profile_id: target.id, crest_slug: crestSlug },
        { onConflict: "profile_id,crest_slug", ignoreDuplicates: true }
      );
    if (error) return json({ error: "grant_failed" }, 500);
  } else {
    const { error } = await db
      .from("user_crests")
      .delete()
      .eq("profile_id", target.id)
      .eq("crest_slug", crestSlug);
    if (error) return json({ error: "revoke_failed" }, 500);
  }

  await logAdminAction(db, profile.id, `crest_${action}`, {
    targetType: "crest",
    targetId: crestSlug,
    payload: { profile_id: target.id, handle: target.handle },
  });

  /* Return refreshed counts so the page can update without a second request. */
  const { data: rows } = await db.from("user_crests").select("crest_slug");
  const counts: Record<string, number> = {};
  for (const row of rows ?? []) {
    const slug = (row as { crest_slug: string | null }).crest_slug;
    if (slug) counts[slug] = (counts[slug] ?? 0) + 1;
  }

  return json({ ok: true, counts, member: target });
}
