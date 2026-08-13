import { json, requireProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* WHAT A MEMBER KEEPS WHEN A SEASON CLOSES.
 *
 * season_settlements has existed since launch and no member has ever been able
 * to see their own row in it. RLS denies the table to every browser role
 * (correctly: Privy makes auth.uid() null, so an owner policy would match
 * nothing), and the only reader in the product was the admin console. So the
 * realm has been freezing a permanent record of each member's season and then
 * showing it to nobody but a steward.
 *
 * This is the member's own half of it, and only their own: the route resolves
 * the profile from a verified token and reads that profile's rows. Nobody's
 * settlement is readable by anybody else, because a settlement carries an
 * earned POINTS balance and publishing one member's balance to another is a
 * privacy decision nobody has made.
 *
 * It is the answer to the question the season close raises. Glory resets, the
 * Houses start level again, and the thing a member walks away with is this
 * row: where they finished, what they held, frozen at the instant it closed
 * and never recomputed. That, the crest, and their Renown, which never falls. */

export const dynamic = "force-dynamic";

interface SettlementRow {
  season_id: number;
  rank: number;
  points: number;
  renown: number;
  glory: number;
  settled_at: string;
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db
    .from("season_settlements")
    .select("season_id, rank, points, renown, glory, settled_at")
    .eq("profile_id", profile.id)
    .order("season_id", { ascending: false })
    .limit(50);

  if (error) return json({ error: "query_failed" }, 500);

  const rows = (data ?? []) as SettlementRow[];
  if (rows.length === 0) return json({ seasons: [] });

  /* The season's name, so the record reads as "Season of the Long Night, 4th"
     rather than as a row of ids. Joined here rather than denormalised into the
     settlement: a season may be renamed, and a member's record should follow
     the name the realm currently gives that season. The RANK and the figures
     are what must never move, and those are frozen. */
  const { data: seasons } = await db
    .from("seasons")
    .select("id, name, starts_at, ends_at")
    .in(
      "id",
      rows.map((r) => r.season_id)
    );

  const names = new Map(
    ((seasons ?? []) as { id: number; name: string; ends_at: string | null }[]).map(
      (s) => [s.id, s]
    )
  );

  return json({
    seasons: rows.map((row) => ({
      season_id: row.season_id,
      name: names.get(row.season_id)?.name ?? null,
      ends_at: names.get(row.season_id)?.ends_at ?? null,
      rank: row.rank,
      points: row.points,
      renown: row.renown,
      glory: row.glory,
      settled_at: row.settled_at,
    })),
  });
}
