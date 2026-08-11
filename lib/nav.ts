export type NavItem = {
  slug: string;
  href: string;
  themed: string;
  plain: string;
  icon: string;
  blurb?: string;
  badge?: string;
};

/* The anchors of the realm. These four are always visible in the side nav and
   never collapse, because they are the product: the feed, the flagship
   mechanic, discovery, and the community unit. Everything else is depth.

   Calls previously appeared in no navigation group at all despite being the
   stated flagship, which is why they were invisible to members. */
export const primaryNav: NavItem[] = [
  { slug: "home", href: "/home", themed: "The Ravenry", plain: "Feed", icon: "home" },
  { slug: "calls", href: "/calls", themed: "Calls", plain: "Predictions", icon: "orb" },
  { slug: "explore", href: "/explore", themed: "The Crossroads", plain: "Explore", icon: "compass" },
  { slug: "houses", href: "/houses", themed: "Houses", plain: "Your banner", icon: "banner" },
];

/* The realm's depth: reputation, competition and the social surfaces that are
   not the daily loop. Collapsible, open by default.

   Claim the Throne is deliberately absent. It was a coming soon marketing page
   occupying a navigation slot, and its mechanics (quests, duels, streaks, House
   Glory) are dissolving into the Ravenry and the House halls rather than
   returning as a destination. */
export const socialNav: NavItem[] = [
  { slug: "rookery", href: "/rookery", themed: "The Rookery", plain: "Live rooms", icon: "signal" },
  { slug: "war", href: "/war", themed: "The War", plain: "Battle for the Realm", icon: "swords" },
  { slug: "renown", href: "/renown", themed: "Crests & Renown", plain: "Reputation", icon: "medal" },
  { slug: "leaderboards", href: "/leaderboards", themed: "The Roll of Honour", plain: "Leaderboards", icon: "crown" },
  { slug: "whispers", href: "/whispers", themed: "Whispers", plain: "Messages", icon: "mail" },
  { slug: "bookmarks", href: "/bookmarks", themed: "Bookmarks", plain: "Saved", icon: "bookmark" },
  { slug: "banners", href: "/banners", themed: "Raise Your Banners", plain: "Refer and earn", icon: "flag" },
];

export const toolsNav: NavItem[] = [
  { slug: "search", href: "/search", themed: "Search", plain: "Find anything", icon: "search" },
  { slug: "raven", href: "/raven", themed: "The Raven", plain: "Ask anything", icon: "raven" },
  { slug: "dna", href: "/dna", themed: "The Bloodline", plain: "Wallet & profile DNA", icon: "orb", badge: "Beta" },
  { slug: "scanner", href: "/scanner", themed: "The Oracle", plain: "Account scanner", icon: "target", badge: "Beta" },
  { slug: "ledger", href: "/ledger", themed: "The Ledger", plain: "Portfolio", icon: "book", badge: "Beta" },
  { slug: "watch", href: "/watch", themed: "The Watch", plain: "Safety", icon: "shield", badge: "Beta" },
  { slug: "scrying", href: "/scrying", themed: "The Scrying Glass", plain: "Discover coins", icon: "eye", badge: "Beta" },
  { slug: "swap", href: "/swap", themed: "The Swap", plain: "Trade any coin", icon: "repost", badge: "Beta" },
  { slug: "forge", href: "/forge", themed: "The Forge", plain: "Staking", icon: "flame", badge: "Beta" },
];

export const accountNav: NavItem[] = [
  { slug: "ravens", href: "/ravens", themed: "Ravens", plain: "Notifications", icon: "bell" },
  { slug: "vault", href: "/vault", themed: "The Vault", plain: "Wallet", icon: "wallet" },
  { slug: "chronicle", href: "/chronicle", themed: "The Chronicle", plain: "Docs", icon: "scroll" },
  { slug: "settings", href: "/settings", themed: "Settings", plain: "Preferences", icon: "sliders" },
];

export const comingSoonNav: NavItem[] = [
  {
    slug: "flock",
    href: "/soon/flock",
    themed: "The Flock",
    plain: "Copy-trading",
    icon: "raven",
    blurb: "Follow a proven caller and mirror their swaps, non-custodially, sized to your purse.",
  },
  {
    slug: "almanac",
    href: "/soon/almanac",
    themed: "The Almanac",
    plain: "Daily prophecy",
    icon: "scroll",
    blurb: "The Raven reads your holdings, your watchlist and the realm's calls into one morning briefing.",
  },
  {
    slug: "mint",
    href: "/soon/mint",
    themed: "The Mint",
    plain: "Trading",
    icon: "coin",
    blurb: "Trade any token across chains, shielded from MEV, gasless.",
  },
  {
    slug: "prophecies",
    href: "/soon/prophecies",
    themed: "Prophecies",
    plain: "Prediction markets",
    icon: "orb",
    blurb: "Call the market. Win the realm.",
  },
  {
    slug: "raven-agent",
    href: "/soon/raven-agent",
    themed: "The Raven, Unbound",
    plain: "Autonomous agent",
    icon: "raven",
    blurb: "Your all-seeing agent that trades, watches and hunts alpha for you.",
  },
  {
    slug: "long-night",
    href: "/soon/long-night",
    themed: "The Long Night",
    plain: "Co-op survival",
    icon: "wall",
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
  "/houses": [
    { href: "/houses", label: "Standings" },
    { href: "/houses?view=mine", label: "My House" },
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
