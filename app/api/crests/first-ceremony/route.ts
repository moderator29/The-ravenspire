import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { findCrest } from "@/components/brand/crests";

/* A member's first-ever crest, celebrated once.
 *
 * `first_crest_slug` is written centrally by lib/points.ts's grantCrest, the
 * moment it is genuinely the first crest a profile has ever held, whichever
 * of the several places in the product that grant a crest happened to do it.
 * This route only ever answers "is there one still to celebrate" and, once
 * shown, "mark it seen": it never decides which crest was first, and it
 * never grants one.
 *
 * GET is read-only and safe to call on every load; POST is the one write,
 * and it is idempotent (celebrating twice is a no-op, never a second row). */

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ pending: false });
  const db = adminClient();
  if (!db) return json({ pending: false });

  const { data } = await db
    .from("profiles")
    .select("first_crest_slug, first_crest_celebrated")
    .eq("id", profile.id)
    .maybeSingle();

  const slug = data?.first_crest_slug as string | null | undefined;
  const celebrated = Boolean(data?.first_crest_celebrated);
  if (!slug || celebrated) return json({ pending: false });

  const crest = findCrest(slug);
  /* An unrecognised slug (a crest retired from the catalogue since it was
     granted) has nothing honest to show; mark it seen rather than serve a
     ceremony for a crest that no longer describes anything. */
  if (!crest) {
    await db
      .from("profiles")
      .update({ first_crest_celebrated: true })
      .eq("id", profile.id);
    return json({ pending: false });
  }

  return json({
    pending: true,
    crest: { slug: crest.slug, name: crest.name, icon: crest.icon },
  });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  await db
    .from("profiles")
    .update({ first_crest_celebrated: true })
    .eq("id", profile.id);

  return json({ ok: true });
}
