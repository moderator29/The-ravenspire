import type { Icon3DName } from "@/components/ui/icon-3d-names";

export type NavItem = {
  slug: string;
  href: string;
  themed: string;
  plain: string;
  /* The flat stroke glyph. This is what navigation, buttons and dense rows
     use, and it is the only icon a nav item ever draws. */
  icon: string;
  /* The 3D icon that is this surface's identity wherever it is presented
     rather than navigated to: the landing page shelves, feature cards, empty
     states, dashboard headers, the Chronicle.

     Kept here rather than at each call site so a surface reads the same
     everywhere. The Scrying Glass is the telescope on the landing page, in
     its own empty state and in the docs, and there is one place to change
     that. Deliberately never drawn in navigation or in settings. */
  icon3d: Icon3DName;
  blurb?: string;
  badge?: string;
};

/* The anchors of the realm. These four are always visible in the side nav and
   never collapse, because they are the product: the feed, the flagship
   mechanic, discovery, and the community unit. Everything else is depth.

   Calls previously appeared in no navigation group at all despite being the
   stated flagship, which is why they were invisible to members. */
export const primaryNav: NavItem[] = [
  { slug: "home", href: "/home", themed: "The Ravenry", plain: "Feed", icon: "home", icon3d: "raven" },
  { slug: "calls", href: "/calls", themed: "Calls", plain: "Predictions", icon: "orb", icon3d: "call-orb" },
  { slug: "explore", href: "/explore", themed: "The Crossroads", plain: "Explore", icon: "compass", icon3d: "compass" },
  { slug: "houses", href: "/houses", themed: "Houses", plain: "Your banner", icon: "banner", icon3d: "banner" },
];

/* The realm's depth: reputation, competition and the social surfaces that are
   not the daily loop. Collapsible, open by default.

   Claim the Throne is deliberately absent. It was a coming soon marketing page
   occupying a navigation slot, and its mechanics (quests, duels, streaks, House
   Glory) are dissolving into the Ravenry and the House halls rather than
   returning as a destination. */
export const socialNav: NavItem[] = [
  { slug: "rookery", href: "/rookery", themed: "The Rookery", plain: "Live rooms", icon: "signal", icon3d: "gathering" },
  { slug: "war", href: "/war", themed: "The War", plain: "Battle for the Realm", icon: "swords", icon3d: "crossed-axes" },
  { slug: "renown", href: "/renown", themed: "Crests & Renown", plain: "Reputation", icon: "medal", icon3d: "trophy" },
  { slug: "leaderboards", href: "/leaderboards", themed: "The Roll of Honour", plain: "Leaderboards", icon: "crown", icon3d: "podium" },
  { slug: "whispers", href: "/whispers", themed: "Whispers", plain: "Messages", icon: "mail", icon3d: "whispers" },
  { slug: "bookmarks", href: "/bookmarks", themed: "Bookmarks", plain: "Saved", icon: "bookmark", icon3d: "archive" },
  { slug: "banners", href: "/banners", themed: "Raise Your Banners", plain: "Refer and earn", icon: "flag", icon3d: "alliance" },
];

export const toolsNav: NavItem[] = [
  { slug: "search", href: "/search", themed: "Search", plain: "Find anything", icon: "search", icon3d: "search" },
  { slug: "raven", href: "/raven", themed: "The Raven", plain: "Ask anything", icon: "raven", icon3d: "herald-ai" },
  { slug: "dna", href: "/dna", themed: "The Bloodline", plain: "Wallet & profile DNA", icon: "orb", icon3d: "network", badge: "Beta" },
  { slug: "scanner", href: "/scanner", themed: "The Oracle", plain: "Account scanner", icon: "target", icon3d: "accuracy", badge: "Beta" },
  { slug: "ledger", href: "/ledger", themed: "The Ledger", plain: "Portfolio", icon: "book", icon3d: "analytics", badge: "Beta" },
  { slug: "watch", href: "/watch", themed: "The Watch", plain: "Safety", icon: "shield", icon3d: "guard", badge: "Beta" },
  { slug: "scrying", href: "/scrying", themed: "The Scrying Glass", plain: "Discover coins", icon: "eye", icon3d: "scrying", badge: "Beta" },
  { slug: "swap", href: "/swap", themed: "The Swap", plain: "Trade any coin", icon: "repost", icon3d: "market", badge: "Beta" },
  { slug: "forge", href: "/forge", themed: "The Forge", plain: "Staking", icon: "flame", icon3d: "forge", badge: "Beta" },
];

export const accountNav: NavItem[] = [
  { slug: "ravens", href: "/ravens", themed: "Ravens", plain: "Notifications", icon: "bell", icon3d: "notifications" },
  { slug: "vault", href: "/vault", themed: "The Vault", plain: "Wallet", icon: "wallet", icon3d: "vault" },
  { slug: "chronicle", href: "/chronicle", themed: "The Chronicle", plain: "Docs", icon: "scroll", icon3d: "chronicle" },
  { slug: "settings", href: "/settings", themed: "Settings", plain: "Preferences", icon: "sliders", icon3d: "settings" },
];

export const comingSoonNav: NavItem[] = [
  {
    slug: "flock",
    href: "/soon/flock",
    themed: "The Flock",
    plain: "Copy-trading",
    icon: "raven",
    icon3d: "raven-alt",
    blurb: "Follow a proven caller and mirror their swaps, non-custodially, sized to your purse.",
  },
  {
    slug: "almanac",
    href: "/soon/almanac",
    themed: "The Almanac",
    plain: "Daily prophecy",
    icon: "scroll",
    icon3d: "season",
    blurb: "The Raven reads your holdings, your watchlist and the realm's calls into one morning briefing.",
  },
  {
    slug: "mint",
    href: "/soon/mint",
    themed: "The Mint",
    plain: "Trading",
    icon: "coin",
    icon3d: "coins",
    blurb: "Trade any token across chains, shielded from MEV, gasless.",
  },
  {
    slug: "prophecies",
    href: "/soon/prophecies",
    themed: "Prophecies",
    plain: "Prediction markets",
    icon: "orb",
    icon3d: "call-orb-alt",
    blurb: "Call the market. Win the realm.",
  },
  {
    slug: "raven-agent",
    href: "/soon/raven-agent",
    themed: "The Raven, Unbound",
    plain: "Autonomous agent",
    icon: "raven",
    icon3d: "nightvale",
    blurb: "Your all-seeing agent that trades, watches and hunts alpha for you.",
  },
  {
    slug: "long-night",
    href: "/soon/long-night",
    themed: "The Long Night",
    plain: "Co-op survival",
    icon: "wall",
    icon3d: "gatehouse",
    blurb: "When the market crashes, the realm holds the Wall together.",
  },
];

/* Mobile bottom nav.

   Rebuilt for V2 around what the realm is actually for. Three changes worth
   recording:

   Calls are the flagship of the product and previously had no navigation
   presence at all, existing only as a post kind inside the feed. They now hold
   a slot.

   /throne held a slot while being a coming soon marketing page. Its mechanics
   (quests, duels, streaks, House Glory) are dissolving into the Ravenry and the
   House halls rather than returning as a destination, so the slot is freed.

   /keep, a member's own profile, was unreachable from mobile entirely. It was
   only linked from the desktop sidebar avatar. It now holds a slot.

   The Vault moves to the top bar as an account affordance. Crypto is
   infrastructure here, not the product, and it does not earn one of five. */
export const bottomNav = [
  { href: "/home", label: "Ravenry", icon: "home" },
  { href: "/calls", label: "Calls", icon: "orb" },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/houses", label: "Houses", icon: "banner" },
  { href: "/keep", label: "Keep", icon: "user" },
];

/* Contextual sub navigation.

   Each top level destination can declare a compact strip of sub destinations
   that appears directly above the dock. This is what stops the bottom nav from
   being five flat links: a section carries its own depth with it, so the feed's
   tabs, the Calls views and a House's sections all live in one predictable
   place instead of being re-invented at the top of every page.

   Keys are matched against the start of the pathname, longest first. */
export type SubNavItem = { href: string; label: string };

export const subNav: Record<string, SubNavItem[]> = {
  "/home": [
    { href: "/home?tab=foryou", label: "For You" },
    { href: "/home?tab=following", label: "Following" },
    { href: "/home?tab=houses", label: "My House" },
    { href: "/home?tab=signal", label: "Signal" },
    { href: "/home?tab=latest", label: "Latest" },
  ],
  "/calls": [
    { href: "/calls", label: "Live" },
    { href: "/calls?view=closing", label: "Closing soon" },
    { href: "/calls?view=trending", label: "Trending" },
    { href: "/calls?view=leaderboard", label: "Callers" },
    { href: "/calls?view=mine", label: "Mine" },
  ],
  "/explore": [
    { href: "/explore", label: "People" },
    { href: "/explore?view=cashtags", label: "Cashtags" },
    { href: "/rookery", label: "Live rooms" },
    { href: "/search", label: "Search" },
  ],
  /* `?view=mine` used to sit between these two and the route has never had such
     a view: it fell through to Standings, so the chip lit up and nothing moved.
     A member's own House is its hall at /houses/[slug], which needs a slug this
     static list cannot know, so the entry is gone rather than faked. These two
     are exactly what the in-page control offers, which is the point. */
  "/houses": [
    { href: "/houses", label: "Standings" },
    { href: "/houses?view=clashes", label: "Clashes" },
  ],
  "/keep": [
    { href: "/keep", label: "Ravens" },
    { href: "/keep?tab=calls", label: "Calls" },
    { href: "/keep?tab=media", label: "Media" },
    { href: "/renown", label: "Renown" },
    { href: "/bookmarks", label: "Saved" },
  ],
  "/war": [
    { href: "/war", label: "Muster" },
    { href: "/war/champions", label: "Champions" },
    { href: "/war/arsenal", label: "Arsenal" },
    { href: "/war/rewards", label: "Rewards" },
  ],
};

/* The sub nav for a pathname, or null when the section has no depth. Matches
   the longest declared prefix so /war/champions resolves to the War strip. */
export function subNavFor(pathname: string): SubNavItem[] | null {
  const key = Object.keys(subNav)
    .filter((k) => pathname === k || pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? subNav[key] : null;
}

export function findComingSoon(slug: string) {
  return comingSoonNav.find((i) => i.slug === slug);
}

/* Every surface the realm declares, in one list. */
export const allNav: NavItem[] = [
  ...primaryNav,
  ...socialNav,
  ...toolsNav,
  ...accountNav,
  ...comingSoonNav,
];

/* The 3D identity of a surface, looked up by the route it lives at.
 *
 * Call sites hold their own copy of a surface's name, blurb and href already,
 * which is fine because those are editorial. The icon is not editorial: the
 * whole point of an identity is that the Scrying Glass is the same telescope
 * on the landing page, in its own empty state and in the docs. So it is looked
 * up rather than repeated, and a surface can be re-illustrated in one edit.
 *
 * Query strings and sub paths resolve to their parent surface, so
 * /houses?view=mine and /war/champions both find their banner. */
export function icon3dFor(href: string): Icon3DName | undefined {
  const path = href.split("?")[0];
  const hit = allNav
    .filter((n) => path === n.href || path.startsWith(`${n.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.icon3d;
}

/* Routes that take the whole viewport.
 *
 * Almost every surface in the realm is a page inside the shell: side nav on
 * the left, right rail from xl, dock at the bottom on a phone. A conversation
 * is not a page. It is a single column that must own the full height, keep its
 * composer against the bottom edge, and scroll only in the middle, and every
 * piece of shell chrome around it either steals that height or competes with
 * the composer for the bottom of the screen.
 *
 * Declared here rather than checked inside each chrome component, so adding a
 * full bleed surface is one line and cannot be half applied. */
export const fullBleedRoutes = ["/raven"];

export function isFullBleed(pathname: string): boolean {
  return fullBleedRoutes.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`)
  );
}
