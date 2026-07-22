type SectionMeta = {
  themed: string;
  plain: string;
  icon: string;
  description: string;
  emptyNote?: string;
};

export const sectionMeta: Record<string, SectionMeta> = {
  home: {
    themed: "The Ravenry",
    plain: "Feed",
    icon: "home",
    description:
      "The feed of the realm. Ravens, Calls with verified verdicts, banter between Houses and word from every corner.",
    emptyNote: "The ravens carry no word yet. Send the first raven.",
  },
  explore: {
    themed: "The Crossroads",
    plain: "Explore",
    icon: "compass",
    description:
      "Where every road meets. Find creators, Houses, tokens, live courts and rising Calls.",
  },
  rookery: {
    themed: "The Rookery",
    plain: "Live",
    icon: "signal",
    description:
      "Live courts hosted by creators. Listen, raise your hand, join the conversation.",
    emptyNote: "No courts are in session. The Rookery opens its doors soon.",
  },
  whispers: {
    themed: "Whispers",
    plain: "Messages",
    icon: "mail",
    description: "Direct whispers, group halls and House chats.",
    emptyNote: "No whispers yet. Start one from any Keep.",
  },
  ravens: {
    themed: "Ravens",
    plain: "Notifications",
    icon: "bell",
    description: "Every raven sent your way: replies, follows, verdicts, duels and House news.",
    emptyNote: "No ravens have arrived for you yet.",
  },
  keep: {
    themed: "My Keep",
    plain: "Profile",
    icon: "user",
    description: "Your seat in the realm. Your ravens, Calls, crests and Renown.",
    emptyNote: "Sign in to raise your Keep.",
  },
  ledger: {
    themed: "The Ledger",
    plain: "Portfolio",
    icon: "book",
    description:
      "Your command center. Net worth, PnL, cost basis and positions from real on-chain data only.",
    emptyNote: "Connect a wallet to open your Ledger.",
  },
  watch: {
    themed: "The Watch",
    plain: "Safety",
    icon: "shield",
    description:
      "The realm's shield. Token and contract scans, approval audits and one-tap revoke, before danger reaches you.",
    emptyNote: "Connect a wallet and the Watch takes its post.",
  },
  scrying: {
    themed: "The Scrying Glass",
    plain: "Smart money",
    icon: "eye",
    description:
      "See what the powerful see. Track great wallets and funds, their flows and their positions.",
  },
  raven: {
    themed: "The Raven",
    plain: "Ask anything",
    icon: "raven",
    description:
      "Witty, regal, all-seeing. Ask about anything in the realm or any token or wallet, over real data only.",
    emptyNote: "The Raven awakens with your sign-in.",
  },
  houses: {
    themed: "Houses",
    plain: "Communities",
    icon: "banner",
    description:
      "Band together. Swear your sword, raise a banner, and carry your House through the Season.",
    emptyNote: "The first banners rise at launch.",
  },
  throne: {
    themed: "Claim the Throne",
    plain: "The Season game",
    icon: "crown",
    description:
      "Houses battle for the Throne through quests, duels of wit and Glory. Rivalry and banter are the engine.",
    emptyNote: "Season I begins when the realm opens.",
  },
  war: {
    themed: "The War",
    plain: "Battle for the Realm",
    icon: "swords",
    description:
      "The flagship. Collect champions, forge your arsenal and lead your House into real-time battle.",
  },
  renown: {
    themed: "Crests & Renown",
    plain: "Reputation",
    icon: "medal",
    description:
      "Reputation here is earned, never bought. Rise from Smallfolk toward King or Queen and collect the crests to prove it.",
  },
  bookmarks: {
    themed: "Bookmarks",
    plain: "Saved",
    icon: "bookmark",
    description: "Ravens and Calls you have saved for later.",
    emptyNote: "Nothing saved yet.",
  },
  banners: {
    themed: "Raise Your Banners",
    plain: "Refer & Earn",
    icon: "flag",
    description:
      "Call your banners. Invite others to the realm and earn as they become active.",
  },
  chronicle: {
    themed: "The Chronicle",
    plain: "Docs",
    icon: "scroll",
    description:
      "The written record of The Ravenspire. What it is, how it works, and how the realm is governed.",
  },
  vault: {
    themed: "The Vault",
    plain: "Wallet",
    icon: "wallet",
    description:
      "Your non-custodial vault. Your keys stay yours, exportable any time. We never hold funds.",
    emptyNote: "Sign in to open your Vault.",
  },
  forge: {
    themed: "The Forge",
    plain: "Staking",
    icon: "flame",
    description:
      "Swear an oath. Stake $RSP and earn real yield from protocol fees, never emissions.",
    emptyNote: "The Forge lights when staking goes live on-chain.",
  },
  settings: {
    themed: "Settings",
    plain: "Preferences",
    icon: "sliders",
    description:
      "Account, profile, privacy, notifications, security, wallets and appearance.",
  },
};
