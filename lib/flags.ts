import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/* The launch switches (V2 Part Two, section 27).
 *
 * realm_flags is the table that turns a sealed chapter into a live one:
 * reliquary_live, chests_live, mercer_live. Server-read only. The padlock UI
 * is driven by these, so opening day is a flag flip and not a deploy.
 *
 * FAIL CLOSED, DELIBERATELY.
 * This module ships before the collectibles migration is applied to the
 * remote database, and it must keep working when Supabase is unreachable or
 * unconfigured (the placeholder keys in .env.local). So every failure mode,
 * including the table not existing yet, reads as "every flag is false":
 * a chapter stays sealed, which is the safe direction, and nothing throws
 * into a rendering page. Do not "fix" this to surface errors; a broken flag
 * read must never take a page down or unseal a chapter early.
 */

const TTL_MS = 45_000;

type FlagCache = { at: number; flags: Record<string, boolean> };

/* In-process cache. Per server instance, which is fine: a flag flip reaching
   each instance within 45 seconds is exactly the freshness launch needs, and
   it keeps the read off the hot path of every gated page. Failures are cached
   for the same window on purpose, so a missing table or a down database is
   asked about once per window rather than once per render. */
let cache: FlagCache | null = null;

export async function getFlags(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.flags;

  let flags: Record<string, boolean> = {};
  try {
    const db = adminClient();
    if (db) {
      const { data, error } = await db
        .from("realm_flags")
        .select("key, enabled");
      /* error covers the table not existing yet (42P01) among everything
         else; data is null then and flags stays empty, so every flag reads
         false. See the header: this is the designed behaviour. */
      if (!error && data) {
        for (const row of data) {
          flags[row.key as string] = row.enabled === true;
        }
      }
    }
  } catch {
    flags = {};
  }

  cache = { at: now, flags };
  return flags;
}

/* True only when the flag row exists and is enabled. Unknown keys, errors and
   a not-yet-migrated database all read false: sealed. */
export async function getFlag(key: string): Promise<boolean> {
  const flags = await getFlags();
  return flags[key] === true;
}
