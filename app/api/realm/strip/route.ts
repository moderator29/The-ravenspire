import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, json } from "@/lib/auth/server";
import { musterState } from "@/lib/realm/muster";
import { gloryStanding } from "@/lib/houses/view";

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
     standings table is a fact; a named rival is a reason to act.

     The ranking itself lives in lib/houses/view.ts because the Herald's digest
     names the same rival, and two copies of that rule would eventually name
     two different Houses. */
  const house = gloryStanding(houses, profile?.house_slug ?? null);

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

  /* The Muster rides on the strip rather than on a request of its own.
     The strip is already the row that answers "is something happening, and am
     I in it", and the daily window is the sharpest answer to that question the
     realm has. It also means the countdown and the claim control cannot
     disagree about whether the window is open, because they read one payload.

     Decided entirely from the server's clock. The response carries absolute
     instants and the server's own `now`, so the surface counts down against a
     skew it measures once instead of against a browser clock that may be
     minutes out. A wrong browser clock can then only mis-render a label, never
     open a window. */
  const muster = await musterState(db, profile?.id ?? null);

  return json({
    streak,
    house,
    openCalls,
    muster,
    season: season
      ? { id: season.id, name: season.name, endsAt: season.ends_at }
      : null,
  });
}
