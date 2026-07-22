import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ muted: [] });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);
  const { data } = await db
    .from("mutes")
    .select("muted_id")
    .eq("muter_id", profile.id);
  return json({ muted: (data ?? []).map((r) => r.muted_id) });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    muted_id?: string;
  } | null;
  if (!body?.muted_id) return json({ error: "bad request" }, 400);
  if (body.muted_id === profile.id)
    return json({ error: "You cannot silence your own voice" }, 400);

  await db
    .from("mutes")
    .upsert(
      { muter_id: profile.id, muted_id: body.muted_id },
      { onConflict: "muter_id,muted_id" }
    );
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    muted_id?: string;
  } | null;
  if (!body?.muted_id) return json({ error: "bad request" }, 400);

  await db
    .from("mutes")
    .delete()
    .eq("muter_id", profile.id)
    .eq("muted_id", body.muted_id);
  return json({ ok: true });
}
