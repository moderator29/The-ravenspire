/* Seasonal House leadership (V2 section 11.2).

   Deliberately not an election. With this population an election with twenty
   voters feels sad, and a computed title feels earned the moment it lands.
   Every role here is derived from what a member actually did this season, so
   leadership rotates on its own every season with zero admin burden, which is
   a re-engagement loop that costs nothing to run.

   Client safe: the labels render in the roster and on a Keep. The derivation
   itself lives in lib/houses/scoring.ts, which is server only. */

export const HOUSE_ROLES = [
  "lord",
  "hand",
  "master-of-ravens",
  "master-of-war",
  "chronicler",
  "recruiter",
] as const;

export type HouseRole = (typeof HOUSE_ROLES)[number];
/* 'sworn' is every member who holds no title. It is the column default. */
export type HouseMemberRole = HouseRole | "sworn";

export interface RoleMeta {
  slug: HouseMemberRole;
  title: string;
  /* How it is earned, in the member's own words. Shown on the roster. */
  earnedBy: string;
  icon: string;
}

export const ROLE_META: Record<HouseMemberRole, RoleMeta> = {
  lord: {
    slug: "lord",
    title: "Lord / Lady",
    earnedBy: "Top House contribution this season",
    icon: "crown",
  },
  hand: {
    slug: "hand",
    title: "Hand of the House",
    earnedBy: "Second highest House contribution this season",
    icon: "medal",
  },
  "master-of-ravens": {
    slug: "master-of-ravens",
    title: "Master of Ravens",
    earnedBy: "Best Call accuracy in the House",
    icon: "raven",
  },
  "master-of-war": {
    slug: "master-of-war",
    title: "Master of War",
    earnedBy: "Most war Glory this season",
    icon: "swords",
  },
  chronicler: {
    slug: "chronicler",
    title: "Chronicler",
    earnedBy: "Most engaged-with ravens this season",
    icon: "scroll",
  },
  recruiter: {
    slug: "recruiter",
    title: "Recruiter",
    earnedBy: "Most referrals who became active members",
    icon: "banner",
  },
  sworn: {
    slug: "sworn",
    title: "Sworn",
    earnedBy: "Swore the oath",
    icon: "shield",
  },
};

/* Rank order for the roster. Titled members sort above the sworn. */
export const ROLE_ORDER: HouseMemberRole[] = [...HOUSE_ROLES, "sworn"];

export function roleMeta(role: string | null | undefined): RoleMeta {
  return ROLE_META[(role ?? "sworn") as HouseMemberRole] ?? ROLE_META.sworn;
}

export function isTitled(role: string | null | undefined): boolean {
  return Boolean(role) && role !== "sworn" && role! in ROLE_META;
}

/* A Call record has to be long enough to mean something before it can win the
   Master of Ravens title. Three lucky Calls is not accuracy. */
export const MASTER_OF_RAVENS_MIN_CALLS = 5;
