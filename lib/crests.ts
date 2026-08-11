import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantCrest } from "@/lib/points";
import { emit } from "@/lib/realm/events";

/* Crests earned automatically from renown and streak milestones. Each entry
   is checked against the caller's current standing; grants are idempotent. */
const AUTO_CRESTS: {
  slug: string;
  title: string;
  earned: (p: { renown: number; streak: number }) => boolean;
}[] = [
  {
    slug: "knight-of-the-realm",
    title: "Knight of the Realm",
    earned: (p) => p.renown >= 400 || p.streak >= 7,
  },
  {
    slug: "warden-of-the-realm",
    title: "Warden of the Realm",
    earned: (p) => p.renown >= 3000,
  },
];

/* Grant any milestone crests the citizen now qualifies for. Idempotent: a
   crest already held is skipped, and no duplicate notification is raised. */
export async function checkAndGrantCrests(
  db: SupabaseClient,
  profileId: string
) {
  const { data: prof } = await db
    .from("profiles")
    .select("renown, streak, house_slug")
    .eq("id", profileId)
    .single();
  if (!prof) return;

  const standing = {
    renown: prof.renown ?? 0,
    streak: prof.streak ?? 0,
  };

  const due = AUTO_CRESTS.filter((c) => c.earned(standing));
  if (due.length === 0) return;

  const { data: held } = await db
    .from("user_crests")
    .select("crest_slug")
    .eq("profile_id", profileId);
  const owned = new Set((held ?? []).map((r) => r.crest_slug as string));

  for (const crest of due) {
    if (owned.has(crest.slug)) continue;
    await grantCrest(db, profileId, crest.slug);
    await db.from("notifications").insert({
      profile_id: profileId,
      kind: "crest",
      subject_id: crest.slug,
      body: `You earned the ${crest.title} crest.`,
    });
    /* Earning a crest is one of the few genuinely rare things that happens in
       the realm and until now nobody but its owner ever saw it. The spine puts
       it in the Ravenry. The unique index makes this idempotent, so the crest
       check running on every award cannot produce a second card. */
    await emit(db, {
      kind: "crest.earned",
      actorId: profileId,
      subjectType: "crest",
      subjectId: crest.slug,
      houseSlug: prof.house_slug ?? null,
      payload: { v: 1, crest_slug: crest.slug, title: crest.title },
    });
  }
}
