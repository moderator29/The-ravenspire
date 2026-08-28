import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grantCrest } from "@/lib/points";
import { emit } from "@/lib/realm/events";
import { createNotification } from "@/lib/notifications";
import { VIGIL_CREST_DAYS, VIGIL_CREST_SLUG } from "@/lib/realm/appointments";

/* Crests earned automatically from renown, streak and vigil milestones. Each
   entry is checked against the caller's current standing; grants are
   idempotent. */
const AUTO_CRESTS: {
  slug: string;
  title: string;
  earned: (p: { renown: number; streak: number; vigil: number }) => boolean;
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
  {
    /* The vigil crest, and the reason the Muster is worth keeping.
     *
     * `lord-of-light` has sat in the crest catalogue since launch reading "for
     * unbroken daily devotion to the realm", marked locked, with a frozen
     * token id and a drawn glyph, and with nothing anywhere in the product
     * able to grant it. It was a promise the realm had no mechanism to keep.
     * The Muster is its producer.
     *
     * Deliberately the VIGIL and not profiles.streak. The plain streak
     * advances for opening the app at any hour, so paying this off it would
     * hand a devotion crest to somebody who has never once been present when
     * the realm was. Thirty consecutive days of catching a two hour window is
     * a hard thing to do and an entirely fair one: it costs no money, needs no
     * followers and cannot be bought. */
    slug: VIGIL_CREST_SLUG,
    title: "Lord of Light",
    earned: (p) => p.vigil >= VIGIL_CREST_DAYS,
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

  /* The vigil is read on its own, and that is not tidiness.
   *
   * PostgREST fails the WHOLE select when one column in it does not exist, so
   * adding muster_streak to the list above would mean that on any database
   * that has not yet taken 20260813113137, this function returns early and
   * NOBODY is granted any crest at all. Migrations in this repository are
   * written and applied separately by a human, so "the column is not there
   * yet" is a state the running code has to survive rather than a state that
   * cannot happen. A missing column costs the vigil crest and nothing else. */
  let vigil = 0;
  const { data: vigilRow } = await db
    .from("profiles")
    .select("muster_streak")
    .eq("id", profileId)
    .maybeSingle();
  if (vigilRow) {
    vigil = ((vigilRow as { muster_streak?: number | null }).muster_streak) ?? 0;
  }

  const standing = {
    renown: prof.renown ?? 0,
    streak: prof.streak ?? 0,
    vigil,
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
    /* B3: through createNotification, so the realtime nudge fires. The slug
       in ref is why the notifications.subject_id column had to become text
       (20260828093353): as a uuid column it rejected every crest slug with
       22P02 and this notice was never written at all. */
    await createNotification(db, {
      profile_id: profileId,
      kind: "crest",
      ref: crest.slug,
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
