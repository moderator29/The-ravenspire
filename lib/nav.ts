export type NavItem = {
  slug: string;
  href: string;
  themed: string;
  plain: string;
  icon: string;
  blurb?: string;
  badge?: string;
};

/* Social-first grouping: the social realm and the games lead, tools support.
   Home (The Ravenry) and Explore (The Crossroads) are intentionally omitted
   here: they already anchor the mobile bottom nav, so listing them in the side
   nav Social group would only duplicate them. */
export const socialNav: NavItem[] = [
  { slug: "rookery", href: "/rookery", themed: "The Rookery", plain: "Live", icon: "signal" },
  { slug: "houses", href: "/houses", themed: "Houses", plain: "Communities", icon: "banner" },
  { slug: "throne", href: "/throne", themed: "Claim the Throne", plain: "Season game", icon: "crown" },
  { slug: "war", href: "/war", themed: "The War", plain: "Battle for the Realm", icon: "swords" },
  { slug: "renown", href: "/renown", themed: "Crests & Renown", plain: "Reputation", icon: "medal" },
  { slug: "leaderboards", href: "/leaderboards", themed: "The Roll of Honour", plain: "Leaderboards", icon: "crown" },
  { slug: "banners", href: "/banners", themed: "Raise Your Banners", plain: "Refer & Earn", icon: "flag" },
  { slug: "whispers", href: "/whispers", themed: "Whispers", plain: "Messages", icon: "mail" },
  { slug: "bookmarks", href: "/bookmarks", themed: "Bookmarks", plain: "Saved", icon: "bookmark" },
];

export const toolsNav: NavItem[] = [
  { slug: "search", href: "/search", themed: "Search", plain: "Find anything", icon: "search" },
  { slug: "raven", href: "/raven", themed: "The Raven", plain: "Ask anything", icon: "raven" },
  { slug: "dna", href: "/dna", themed: "The Bloodline", plain: "Wallet & profile DNA", icon: "orb", badge: "Beta" },
  { slug: "scanner", href: "/scanner", themed: "The Oracle", plain: "Account scanner", icon: "target", badge: "Beta" },
  { slug: "ledger", href: "/ledger", themed: "The Ledger", plain: "Portfolio", icon: "book" },
  { slug: "watch", href: "/watch", themed: "The Watch", plain: "Safety", icon: "shield", badge: "Beta" },
  { slug: "scrying", href: "/scrying", themed: "The Scrying Glass", plain: "Discover coins", icon: "eye" },
  { slug: "swap", href: "/swap", themed: "The Swap", plain: "Trade any coin", icon: "repost", badge: "Beta" },
  { slug: "forge", href: "/forge", themed: "The Forge", plain: "Staking", icon: "flame" },
];

export const accountNav: NavItem[] = [
  { slug: "ravens", href: "/ravens", themed: "Ravens", plain: "Notifications", icon: "bell" },
  { slug: "vault", href: "/vault", themed: "The Vault", plain: "Wallet", icon: "wallet" },
  { slug: "chronicle", href: "/chronicle", themed: "The Chronicle", plain: "Docs", icon: "scroll" },
  { slug: "settings", href: "/settings", themed: "Settings", plain: "Preferences", icon: "sliders" },
];

export const comingSoonNav: NavItem[] = [
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

/* Mobile bottom nav: social-first. */
export const bottomNav = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/rookery", label: "Live", icon: "signal" },
  { href: "/throne", label: "Throne", icon: "crown" },
  { href: "/vault", label: "Vault", icon: "wallet" },
];

export function findComingSoon(slug: string) {
  return comingSoonNav.find((i) => i.slug === slug);
}
