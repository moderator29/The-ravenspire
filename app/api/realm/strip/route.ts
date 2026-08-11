import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, json } from "@/lib/auth/server";

/* The realm strip.
 *
 * One request backing the row that sits above the Ravenry. Its whole job is to
 * answer, before a member scrolls, "is something happening, and am I in it".
 *
 * Four facts, chosen because each one is either a streak a member can lose
 * today, a rivalry they can affect, a clock that is running, or a promise they
 * have already made. Nothing here is decorative.
 *
 * Real data only. Any field the realm cannot answer honestly comes back null
 * and the strip simply does not render that cell.
 */

export const dynamic = "force-dynamic";

interface HouseRow {
  slug: string;
  name: string;
  glory: number | null;
}

export async function GET(req: NextRequest) {
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const profile = await getProfile(req);

  const [housesRes, seasonRes] = await Promise.all([
    db.from("houses").select("slug, name, glory").order("glory", { ascending: false }),
    db
      .from("seasons")
      .select("id, name, ends_at, status")
      .eq("status", "active")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const houses = (housesRes.data ?? []) as HouseRow[];

  /* The member's House, and the House immediately above or below it. A
     standings table is a fact; a named rival is a reason to act. */
  let house = null as
    | {
        slug: string;
        name: string;
        rank: number;
        glory: number;
        rival: { name: string; gap: number; ahead: boolean } | null;
      }
    | null;

  if (profile?.house_slug && houses.length > 0) {
    const index = houses.findIndex((h) => h.slug === profile.house_slug);
    if (index >= 0) {
      const mine = houses[index];
      const above = index > 0 ? houses[index - 1] : null;
      const below = index < houses.length - 1 ? houses[index + 1] : null;
      /* Prefer whoever is closest. Being 40 behind the House above is a better
         story than being 900 ahead of the House below. */
      const gapAbove = above ? (above.glory ?? 0) - (mine.glory ?? 0) : null;
      const gapBelow = below ? (mine.glory ?? 0) - (below.glory ?? 0) : null;
      let rival: { name: string; gap: number; ahead: boolean } | null = null;
      if (gapAbove !== null && (gapBelow === null || gapAbove <= gapBelow)) {
        rival = { name: above!.name, gap: gapAbove, ahead: true };
      } else if (gapBelow !== null) {
        rival = { name: below!.name, gap: gapBelow, ahead: false };
      }
      house = {
        slug: mine.slug,
        name: mine.name,
        rank: index + 1,
        glory: mine.glory ?? 0,
        rival,
      };
    }
  }

  /* SessionProfile carries a fixed column list that does not include streak, so
     it is read here rather than assumed. */
  let streak: number | null = null;
  if (profile) {
    const { data } = await db
      .from("profiles")
      .select("streak")
      .eq("id", profile.id)
      .maybeSingle();
    streak = (data as { streak: number | null } | null)?.streak ?? 0;
  }

  /* Calls the member has sealed that have not settled. A promise already made
     is the strongest reason to come back. */
  let openCalls: number | null = null;
  if (profile) {
    const { count } = await db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id)
      .eq("kind", "call")
      .eq("deleted", false)
      .eq("call->>verdict", "open");
    openCalls = count ?? 0;
  }

  const season = seasonRes.data as
    | { id: number; name: string; ends_at: string }
    | null;

  return json({
    streak,
    house,
    openCalls,
    season: season
      ? { id: season.id, name: season.name, endsAt: season.ends_at }
      : null,
  });
}
