import "server-only";
import type { adminClient } from "@/lib/supabase/admin";

type Db = NonNullable<ReturnType<typeof adminClient>>;

/* A member's standing in the War, and the one place that brings it into being.
 *
 * The row's defaults are the game's opening position: three sworn champions,
 * two hundred gold, and one relic chest waiting to be opened. They live in the
 * baseline schema, on the table, which is the only place they can be true.
 *
 * They were also written out a second time, by hand, in the GET of
 * app/api/war/battle as a fallback object for a member with no row yet. That
 * copy listed the champions and the gold and stopped there: no `chests`, no
 * `mastery`. So a brand new member opened the War, was shown "No chests", and
 * the chest the database had already granted them was invisible until some
 * other request happened to create the row. Two copies of a default is one
 * copy too many, and this is the one that is real.
 */
export interface WarStateRow {
  profile_id: string;
  unlocked_champions: string[];
  gold: number;
  war_glory: number;
  battles: number;
  wins: number;
  chests: number;
  mastery: Record<string, number> | null;
  last_daily: string | null;
}

/* Read the member's war state, creating it from the table's own defaults when
   this is their first time asking. Returns null only when the row can neither
   be read nor created, which the routes answer as unavailable rather than as
   an invented standing. */
export async function warState(
  db: Db,
  profileId: string
): Promise<WarStateRow | null> {
  const existing = await db
    .from("war_state")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing.data) return existing.data as WarStateRow;

  /* ignoreDuplicates, because two requests from the same member arriving
     together (the War page and its prepare screen both open with a read) would
     otherwise race on the primary key and one of them would fail. The loser
     reads the winner's row below. */
  const created = await db
    .from("war_state")
    .upsert(
      { profile_id: profileId },
      { onConflict: "profile_id", ignoreDuplicates: true }
    )
    .select("*")
    .maybeSingle();
  if (created.data) return created.data as WarStateRow;

  const raced = await db
    .from("war_state")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  return (raced.data as WarStateRow | null) ?? null;
}
