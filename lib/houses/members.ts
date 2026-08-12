import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Public identity for the House roster and the contributor boards.

   Only the fields a Keep already shows publicly. A roster is a public list of
   who stands under a banner, not a data export. */

export interface MemberIdentity {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  renown: number;
  is_agent: boolean;
}

const IDENTITY_SELECT =
  "id, handle, display_name, avatar_url, house_slug, tier, renown, is_agent";

export async function loadIdentities(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, MemberIdentity>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data } = await db
    .from("profiles")
    .select(IDENTITY_SELECT)
    .in("id", unique);
  const map = new Map<string, MemberIdentity>();
  for (const row of (data ?? []) as MemberIdentity[]) map.set(row.id, row);
  return map;
}

export interface RosterEntry {
  profile_id: string;
  role: string;
  sworn_at: string;
  season_id: number | null;
  contribution: number;
  member: MemberIdentity | null;
}

/* Every member currently sworn to a House, with the contribution that ranks
   them. Members with no contribution this season are still on the roster:
   a House is who stands under the banner, not only who scored. */
export async function loadRoster(
  db: SupabaseClient,
  houseSlug: string,
  contribution: Map<string, number>
): Promise<RosterEntry[]> {
  const { data } = await db
    .from("house_members")
    .select("profile_id, role, sworn_at, season_id")
    .eq("house_slug", houseSlug)
    .is("left_at", null)
    .order("sworn_at", { ascending: true });

  const rows = (data ?? []) as {
    profile_id: string;
    role: string;
    sworn_at: string;
    season_id: number | null;
  }[];
  const identities = await loadIdentities(
    db,
    rows.map((r) => r.profile_id)
  );

  return rows.map((r) => ({
    profile_id: r.profile_id,
    role: r.role,
    sworn_at: r.sworn_at,
    season_id: r.season_id,
    contribution: contribution.get(r.profile_id) ?? 0,
    member: identities.get(r.profile_id) ?? null,
  }));
}
