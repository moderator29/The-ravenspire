/* Shapes the House surfaces read, and the two bits of formatting they share.

   Client safe on purpose: lib/houses/oath.ts and lib/houses/scoring.ts are
   `import "server-only"` because they reach the ledger and the oath history,
   so the pages cannot import their types. These mirror what the routes
   actually return. */

export interface MemberIdentityView {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  renown: number;
  is_agent: boolean;
}

export interface HouseLevelView {
  level: number;
  floor: number;
  next: number;
  progress: number;
  cumulative?: number;
}

export interface HouseStandingRow {
  slug: string;
  rank: number;
  score: number;
  mean: number;
  contributor_count: number;
  member_count: number;
  counted: number;
  rival: { slug: string; gap: number; ahead: boolean } | null;
  level: HouseLevelView;
  cumulative: number;
}

export interface BoardEntry {
  rank: number;
  profile_id: string;
  contribution: number;
  counts: boolean;
  role: string;
  member: MemberIdentityView | null;
}

export interface RosterEntryView {
  profile_id: string;
  role: string;
  sworn_at: string;
  season_id: number | null;
  contribution: number;
  member: MemberIdentityView | null;
}

export interface PastMemberView {
  profile_id: string;
  span: string;
  left_at: string | null;
  member: MemberIdentityView | null;
}

export interface HouseHall {
  house: {
    slug: string;
    name: string;
    motto: string;
    sigil: string;
    color: string;
    desc: string;
  };
  season: { id: number; name: string; ends_at: string } | null;
  offSeason: boolean;
  standing: {
    rank: number;
    score: number;
    mean: number;
    contributor_count: number;
    member_count: number;
    counted: number;
    top_n: number;
  };
  rival: {
    slug: string;
    name: string;
    color: string | null;
    gap: number;
    ahead: boolean;
    score: number;
  } | null;
  level: HouseLevelView;
  board: BoardEntry[];
  roster: RosterEntryView[];
  past: PastMemberView[];
}

export interface ClashHouseRow {
  slug: string;
  name: string;
  color: string;
  score: number;
  mean: number;
  calls: number;
  hits: number;
  open: number;
  contributor_count: number;
  rank: number;
}

export interface ClashContributorRow {
  profile_id: string;
  house_slug: string;
  house_name: string;
  glory: number;
  calls: number;
  hits: number;
  misses: number;
  open: number;
  member: MemberIdentityView | null;
}

export interface ClashRow {
  id: string;
  title: string;
  token: string | null;
  theme: string | null;
  starts_at: string;
  ends_at: string;
  season_id: number | null;
  phase: "upcoming" | "live" | "closed";
  houses: ClashHouseRow[];
  contributors: ClashContributorRow[];
}

export interface OathEntryView {
  id: string;
  house_slug: string;
  house_name: string;
  color: string | null;
  role: string;
  span: string;
  sworn_at: string;
  left_at: string | null;
  season_id: number | null;
  left_season_id: number | null;
  current: boolean;
}

/* How long is left, in the coarsest honest unit. Never counts past a close. */
function remaining(iso: string): string | null {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = Math.floor(ms / 3.6e6);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hours left`;
  return `${Math.max(1, Math.floor(ms / 6e4))} minutes left`;
}

export function seasonCountdown(endsAt: string): string {
  return remaining(endsAt) ?? "closed";
}

export function clashCountdown(clash: {
  phase: string;
  starts_at: string;
  ends_at: string;
}): string {
  if (clash.phase === "live") return remaining(clash.ends_at) ?? "closing";
  if (clash.phase === "upcoming") {
    const until = remaining(clash.starts_at);
    return until ? `opens in ${until.replace(" left", "")}` : "opening";
  }
  return `closed ${new Date(clash.ends_at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}`;
}
