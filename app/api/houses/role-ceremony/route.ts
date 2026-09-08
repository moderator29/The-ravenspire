import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { houseBySlug } from "@/lib/data/houses";
import { roleMeta } from "@/lib/houses/roles";

/* A member's House title, celebrated once per promotion.
 *
 * `house_members.role_celebrated` is cleared centrally by
 * lib/houses/scoring.ts's recompute pass, the moment a member holds a title
 * they did not hold a moment ago (sworn to any title, or the instant they
 * reach Lord specifically). This route only ever answers "is there one still
 * to celebrate" and, once shown, "mark it seen": it never decides who holds
 * what, and it never grants a title.
 *
 * GET is read-only and safe to call on every load; POST is the one write,
 * and it is idempotent (celebrating twice is a no-op, never a second row). */

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ pending: false });
  const db = adminClient();
  if (!db) return json({ pending: false });

  const { data } = await db
    .from("house_members")
    .select("role, house_slug, role_celebrated")
    .eq("profile_id", profile.id)
    .is("left_at", null)
    .maybeSingle();

  const role = data?.role as string | null | undefined;
  const celebrated = data?.role_celebrated !== false;
  if (!role || role === "sworn" || celebrated) return json({ pending: false });

  const house = houseBySlug(data?.house_slug as string | null | undefined);
  /* No House to name (the member has since left, or the slug no longer
     resolves), nothing honest to celebrate; mark it seen rather than serve a
     ceremony that cannot say which House it is for. */
  if (!house) {
    await db
      .from("house_members")
      .update({ role_celebrated: true })
      .eq("profile_id", profile.id);
    return json({ pending: false });
  }

  const meta = roleMeta(role);
  return json({
    pending: true,
    role: { slug: meta.slug, title: meta.title, earnedBy: meta.earnedBy, icon: meta.icon },
    house: { slug: house.slug, name: house.name },
  });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  await db
    .from("house_members")
    .update({ role_celebrated: true })
    .eq("profile_id", profile.id);

  return json({ ok: true });
}
