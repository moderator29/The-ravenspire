import type { Icon3DName } from "@/components/ui/icon-3d-names";

/* The Chronicle: the realm's own documentation, rendered at /chronicle.

   Rewritten for V2 (section 16). The previous eight sections described a
   product that no longer exists: they omitted Whispers, the Herald, every
   Tool, the Rookery, Leaderboards, notifications, the Bloodline and the
   Oracle, and they described a merkle claim that was never built. Worse, they
   presented the Forge as a future chapter and Claim the Throne as a running
   game.

   Two rules govern this file:

   1. Every claim must be true of the code as it stands today. If a surface is
      built but its controls are not, that is stated rather than smoothed over.
   2. Every section and every caveat carries a status. A member reading the
      Chronicle should never have to guess whether something works. */

export type ChronicleStatus = "live" | "in-development" | "planned";

export const STATUS_LABEL: Record<ChronicleStatus, string> = {
  live: "Live",
  "in-development": "In development",
  planned: "Planned",
};

/* A caveat attached to a section: a part of it that is at a different stage
   from the section as a whole. This is where honesty about half-built things
   lives, so the prose never has to hedge. */
export interface ChronicleNote {
  status: ChronicleStatus;
  text: string;
}

export interface ChronicleSection {
  slug: string;
  /* The section's 3D icon. The Chronicle is the realm explaining itself, and
     a wall of identical prose blocks is hard to navigate by eye. The icon is
     what a member scrolling for the Vault actually scans for. */
  icon3d: Icon3DName;
  title: string;
  plain: string;
  status: ChronicleStatus;
  body: string[];
  notes?: ChronicleNote[];
}

export const chronicle: ChronicleSection[] = [
  {
    slug: "what-is-ravenspire",
    icon3d: "world",
    title: "What Ravenspire Is",
    plain: "A competitive online realm where communities earn reputation through participation.",
    status: "live",
    body: [
      "Ravenspire is a competitive online realm where communities earn reputation through participation. You post, you argue, you make Calls about what happens next, and the realm keeps the record of who read it right. Crypto is infrastructure here, community is the product, and reputation is the progression system.",
      "Nothing that carries standing can be bought. Renown, Crests, House titles and a place on the Roll of Honour come only from what you actually did, and every one of them leaves a public receipt. There is no shop, no velvet rope, and no way to buy a rank.",
      "The Chronicle is the honest map of the realm rather than the sales pitch. Every section is labelled Live, In development, or Planned, and anything half-built says so. If you find a claim here that the product does not keep, treat it as a bug in this document.",
    ],
  },

  {
    slug: "the-ravenry",
    icon3d: "raven",
    title: "The Ravenry",
    plain: "The feed, and the dashboard above it.",
    status: "live",
    body: [
      "The Ravenry is the public square, and it opens on a strip of four facts before you scroll: your streak, where your House stands and how far its nearest rival is, how many Calls you have running, and how long the season has left. Real data only. A cell the realm cannot answer honestly does not render at all, and when none of them can be answered the strip disappears rather than showing a row of zeroes.",
      "The composer sits inside the feed rather than behind a floating button. It takes plain text with mentions, cashtags and links highlighted as you type, up to four images, polls, and Calls. Every raven is aimed at an audience: Public, Followers, your House, or mentions only. If you want a running start rather than a blank box, the Herald will suggest a draft.",
      "Five tabs cover the feed: For You, Following, My House, Signal and Latest. You can like, reply in threads delivered in near real time, bookmark to a private shelf only you can read, and re-raven what you admire. Every counter is kept on the server, so what you see is what happened.",
      "The realm ships a full safety kit. Mute quietly removes an author from your view, block severs the relationship in both directions and filters that member out of the feed, threads and notifications, and report opens a case that lands in a moderation queue a human works through.",
      "Ravens, at the notifications hall, carry likes, replies, re-ravens, follows, tributes, mentions, whispers, the Herald's answers, duel outcomes, verdicts on your Calls, and the Calls and trades of the people you follow. Every kind has its own switch in settings. Delivery is in-app only today; there is no email or messenger delivery anywhere in the realm.",
      "Underneath all of this runs the realm event spine. Every meaningful act writes one record: a Call sealed, a Call resolved, a Crest earned, one House overtaking another, a duel opened, a quest completed, an oath sworn. Each record carries who it is for, so a House event reaches the House and a private one reaches only you.",
    ],
    notes: [
      {
        status: "in-development",
        text: "The event stream is written and readable, but the Ravenry does not yet render event cards alongside ravens. Until it does, those events reach you through the surfaces they belong to and through your Ravens.",
      },
      {
        status: "in-development",
        text: "Quests and duels of wit run on the server and emit their events, but they have no surface yet. They are dissolving into the Ravenry and the House halls rather than returning as a destination, which is why Claim the Throne is no longer a place you visit.",
      },
    ],
  },

  {
    slug: "calls",
    icon3d: "call-orb",
    title: "Calls",
    plain: "The flagship. A public claim, scored against how hard it actually was.",
    status: "live",
    body: [
      "A Call is a public, timestamped claim about something that has not happened yet, sealed with your name on it. It is the flagship of the realm and it has its own hall, with views for Calls running now, Calls closing soon, what the realm is arguing about, the caller board, and your own record.",
      "Difficulty is measured, not guessed. The realm reads the token's own trailing realized volatility and derives from it the chance the move happens on its own with no skill involved. That baseline is what your Call is scored against, which is why a blue chip drifting a fraction of a percent in a day and a fresh token needing forty percent in a day can no longer score the same. The baseline is computed and frozen at the moment you seal, so you are always judged against the world as it stood when you committed and never a later one. If the realm cannot read a real price or measure a real volatility, the Call is refused rather than sealed against an invented difficulty.",
      "You state a confidence between 0.55 and 0.99. Your score is a hundred times the base-two logarithm of your probability for what actually happened, divided by the baseline's probability for that same outcome, held between minus one hundred and plus one hundred. Once at least three independent members have Called the same token, move and window, the crowd replaces the volatility model as the baseline. Your own Calls and your House-mates' are excluded from that crowd, because six people in one House agreeing is not a crowd.",
      "Being wrong costs you, but not from the same pot. A Call pays Renown of at most its score and never less than nothing: Renown is permanent, it never falls, and a bad month cannot erase a good year. Season Rating takes the same score signed, so it can go negative, and it resets when the season does. That is the split. Nothing permanent can be taken from you, and a Call still means something.",
      "Settlement is by identity, not by ticker. A Call is settled against the contract address and chain pinned when it was sealed, or against a canonical market identifier for a major coin that has no single contract. A ticker is not an identity: anyone can deploy a token with the same three letters tomorrow, and the realm will not settle your Call against an impostor. Calls sealed before this existed fall back to the ticker they were sealed against, are marked as legacy, and score nothing rather than being handed a difficulty invented after the fact.",
      "A Call carries a category and a resolver. Categories are markets, esports, gaming, culture, sport, and the realm itself. Two resolvers work today: price, which reads real market data, and internal, which resolves claims about the realm, such as which House leads the season or whether a member reaches a tier, from our own records at no external cost. Windows are twenty four hours, seven days and thirty days. Five Calls may run at once, so every slot has to be worth spending.",
      "Renown drawn from social actions is capped at two hundred a day, which a genuinely active member never notices and a pair of colluding accounts hits inside an hour. Renown from resolved Calls is deliberately uncapped, and the flat award a landing Call pays is scaled by how hard the Call actually was, so a coin flip pays almost nothing.",
    ],
    notes: [
      {
        status: "in-development",
        text: "The composer does not yet carry the confidence slider or show you the frozen difficulty before you seal. Until it does, a Call is sealed at the bottom of the band, 0.55, which is the least you could have meant and can never inflate a score.",
      },
      {
        status: "planned",
        text: "Community and admin resolvers are designed but not built. A Call that asks for one is refused when you seal it rather than accepted and left open forever.",
      },
    ],
  },

  {
    slug: "houses",
    icon3d: "banner",
    title: "The Houses",
    plain: "Six banners, size-neutral scoring, and leadership earned every season.",
    status: "live",
    body: [
      "Every member swears to one of six Houses. Corvane remembers, and draws the schemers. Emberfall burns brighter, and takes the bold. Frosthold does not yield, and gathers the patient. Stormcrest moves swift as thunder. Nightvale finds truth in shadow. Goldmane holds that fortune favours the loud. Your House is your banner, your rivalry and your team.",
      "Scoring is size-neutral by design. A House scores the sum of its top twenty contributors this season and nothing else, with ties broken on those same members' mean. Six Houses of unequal membership summed across everyone is a headcount contest, not a contest of skill, and a fixed count removes that entirely. The contributing twenty are named and live on the House hall, so who is carrying the House is a public, churning list rather than a number.",
      "Leadership is computed from what people did, not elected. Six titles turn over each season: Lord or Lady for the top contribution, Hand of the House for the second, Master of Ravens for the best Call accuracy, Master of War for the most war Glory, Chronicler for the most engaged-with ravens, and Recruiter for the most referrals who actually became active members. Each member holds at most one title, so six different people carry something rather than the season's best collecting the set.",
      "An oath is a dated commitment, not a profile field, and your whole oath history is public on your Keep. You may swear a new oath only in the off-season window between seasons, so helping an underdog rise means committing early while it is still a risk. Contribution you have already made stays with the House that earned it, permanently, and never follows you. Under a new banner you start at zero, and one full season must pass before you may switch again.",
      "House Clashes are the events. A Clash is a forty eight hour window on one nominated token or theme, and only Calls made inside that window count. The scoreboard is live, the contributors are named, and the scoring is the same top twenty rule the season uses. Clashes are opened by the realm's stewards and appear in the Houses hall.",
    ],
  },

  {
    slug: "renown-and-crests",
    icon3d: "trophy",
    title: "Renown, Crests and the Roll of Honour",
    plain: "Standing you earn, medals you cannot buy, four public ladders.",
    status: "live",
    body: [
      "Renown is the realm's measure of standing and it climbs through seven tiers: Smallfolk, then Squire at a hundred, Knight at four hundred, Lord or Lady at twelve hundred, Warden at three thousand, Hand at seven thousand, and King or Queen at fifteen thousand. Renown cannot be purchased, transferred, or quietly gifted by a friend in high places, and it never falls. The only road up is the long one.",
      "Crests are the realm's medals, struck for deeds. Ten are designed and three can be earned today: Took the Black for finishing onboarding, Knight of the Realm at four hundred Renown or a seven day streak, and Warden of the Realm at three thousand Renown. They sit on your Keep like a coat of arms.",
      "To be plain about what a Crest is not: it is not an NFT, not a token, and not a tradable asset of any kind. There is no shop, no price and no back door. A Crest is worth what a medal is worth, which is everything to the person who earned it and nothing on a market.",
      "The Roll of Honour runs four ladders. Accuracy ranks members on their settled Calls using a shrunk mean, so a long honest record beats a lucky streak of three, and it shows the raw hit rate and the sample size behind the rank. The other three rank Renown, Glory won in the games, and points earned across the realm.",
    ],
    notes: [
      {
        status: "planned",
        text: "Renown tiers do not yet unlock capabilities. Today a tier is a title and a place on the ladder. Tying real permissions to the ladder, so that standing hands over a share of running the realm, is a later chapter.",
      },
      {
        status: "planned",
        text: "Seven of the ten Crests are designed and not yet grantable. They are shown dimmed rather than hidden, so nobody is told a locked Crest is available.",
      },
    ],
  },

  {
    slug: "the-herald",
    icon3d: "herald-ai",
    title: "The Herald",
    plain: "@raven, the realm's resident intelligence, reasoning over real data.",
    status: "live",
    body: [
      "Tag @raven in a raven or a comment, reply to something the Herald itself said, or visit its own hall, and it answers. It settles debates, reads the realm, and explains any token or wallet you point it at. It runs on Anthropic's Claude Sonnet 5 and every answer is a real model call over real data.",
      "The Herald speaks in four voices you choose between: the realm's own, witty and regal; Lore, a grander and older narrator; Normal, a clear modern assistant with the fantasy dropped entirely; and Degen, fast and crypto-native. A live browsing toggle lets it search the open web when a question turns on something current, and the sources it used are listed beside the reply so you can check them.",
      "When a question is about a token or a wallet, the answer carries a structured card built from real market and chain data rather than prose about numbers.",
      "The iron rules never bend. The Herald never invents a price, a percentage or a statistic; a number it was not given does not exist, and it says so plainly instead of filling the silence. It never tells anyone to buy, sell or hold. It is authenticated and rate limited so it answers members rather than scripts, and it falls silent after eight replies under a single raven so a thread cannot become a monologue.",
    ],
  },

  {
    slug: "whispers-and-the-rookery",
    icon3d: "whispers",
    title: "Whispers and the Rookery",
    plain: "Private messages, and live courts with real voices in them.",
    status: "live",
    body: [
      "Whispers are private direct messages, scoped to the two members in them, delivered in real time, and carrying images alongside text. A Message action on any Keep opens one.",
      "The Rookery is where the realm gathers to talk out loud. A court is a live audio room with a host, a participant count, and its House colours, and courts appear as live or scheduled so you can see what is running now and what is coming. The audio is real, and joining is authorised by a token minted and signed on the server so a seat cannot be forged.",
      "When live audio is not configured, the Rookery says so rather than presenting a stage that leads nowhere.",
    ],
  },

  {
    slug: "the-vault",
    icon3d: "vault",
    title: "The Vault",
    plain: "Your wallet. Non-custodial in the fullest sense.",
    status: "live",
    body: [
      "Every member gets an embedded wallet the moment they enter, and here is the part that matters: it is yours. The keys are generated for you alone, the realm never sees them, and the realm never stores them. Ravenspire cannot move your funds, freeze your wallet, or recover your keys, because it simply does not have them.",
      "The Vault gives you backup and export at any time, send and receive for real transfers, and live balances read from chain data. Export your keys to any standard wallet application and carry on without us. There is no lock-in, no exit fee and no permission to ask.",
      "Tributes work the same way. When you tip another member, the transfer is signed and broadcast from your own wallet in your own browser; the realm resolves the recipient's address and records the tribute only after it has settled on chain. The platform is never in the path of the funds.",
      "This design is deliberate. Custody is a promise platforms often make and sometimes break, so we chose the architecture where the promise cannot be broken. Guard your keys well, because no one, including us, can restore them for you.",
    ],
  },

  {
    slug: "the-war",
    icon3d: "crossed-axes",
    title: "The War",
    plain: "Battle for the Realm, and the Glory that comes out of it.",
    status: "live",
    body: [
      "The War is the realm's arcade contest. Muster champions across five rarities, arm them from the arsenal, upgrade them with gold won in battle, and lead them out onto the field. Battles play out live in the browser.",
      "Everything that pays out is settled on the server. Kills are capped at the real number of foes on the field, rewards are computed and capped server-side against what actually happened, and Glory and gold are banked only for champions you genuinely own. A number sent by a client never mints anything on its own.",
      "The War is not an island. Glory won there decides the Master of War title in your House, and daily war Glory feeds your House's season standing.",
    ],
  },

  {
    slug: "the-tools",
    icon3d: "workshop",
    title: "The Tools",
    plain: "Serious instruments that sit quietly under the play.",
    status: "live",
    body: [
      "The Ledger reads your portfolio and profit across chains from real on-chain data. The Watch scans a token for the things that ruin people: contract permissions, trading traps, holder concentration and liquidity. The Scrying Glass is live coin discovery across chains. The Swap trades any supported EVM coin for any other, routed for the best price and signed by your own wallet, never by us.",
      "The Bloodline reads the character of a wallet or an account. The Oracle scans your own account and returns an honest briefing on your standing, your ravens and, if you have linked one, your wallet. It reads owner data only. Search finds anything in the realm, and the Herald answers anything about it.",
      "These are marked Beta in the navigation because they are young, not because the data is fake. Every tool reads real sources or says plainly that it cannot, and none of them takes custody of anything.",
    ],
    notes: [
      {
        status: "in-development",
        text: "The Forge is the realm's staking hall. The hall is built and the terms are on the page, but staking is not live on chain: the contract wiring is the remaining work, and until it lights there is nothing to sign and nothing to lock. When it opens, the Forge will pay yield from real protocol fees, never from emissions.",
      },
    ],
  },

  {
    slug: "seasons-and-points",
    icon3d: "season",
    title: "Seasons and Points",
    plain: "How the clock works, what earns, and what a point is.",
    status: "live",
    body: [
      "The realm runs in seasons. Season Rating and House standings reset when a season turns; Renown and Crests do not, because they are permanent legacy. The season countdown sits in the strip above the Ravenry, and oaths may be sworn only in the window between seasons.",
      "Points are earned for real actions: entering the realm and finishing onboarding, sending a raven, sealing a Call, replying to someone, being liked, landing a Call, winning a duel, and bringing in a member who becomes genuinely active. Points and Glory settle on the server against verified events, never on the word of a browser. Renown drawn from social actions is capped daily so two accounts cannot farm each other into the tiers.",
      "Earned balances are shown as POINTS everywhere in the realm. No $RSP figure is displayed against your name, because none has been distributed.",
      "The realm's token is $RSP, with a total supply of ten billion. Points convert to $RSP at the token generation event. The presale runs on an external launchpad and never on this platform. Presale coming soon, and the details will be announced in the open when it is ready.",
      "One honest note, stated plainly: points reward participation and creativity. They are not an investment, and nothing here promises a financial return. Come for the realm. Anything else is a bonus you verify yourself.",
    ],
    notes: [
      {
        status: "planned",
        text: "The claim itself does not exist yet. There is no claim route, no published distribution and nothing on chain. When it ships it will be non-custodial from end to end: you claim to your own wallet and the realm never takes possession in the middle.",
      },
    ],
  },

  {
    slug: "the-chapters-ahead",
    icon3d: "realm-map",
    title: "The Chapters Ahead",
    plain: "Six chapters on the map, none of them built.",
    status: "planned",
    body: [
      "Ravenspire is a realm under construction, and we would rather show you the map than pretend the castle is finished. Six chapters are planned. Each has a page in the realm so you can see what is coming, and each is labelled as exactly what it is.",
      "The Flock: follow a proven caller and mirror their swaps, non-custodially, sized to your purse.",
      "The Almanac: the Raven reads your holdings, your watchlist and the realm's calls into one morning briefing.",
      "The Mint: trade any token across chains, shielded from MEV, gasless.",
      "Prophecies: call the market, win the realm.",
      "The Raven, Unbound: your all-seeing agent that trades, watches and hunts alpha for you.",
      "The Long Night: when the market crashes, the realm holds the Wall together.",
      "Roadmaps are intentions, not oaths. The order may shift, chapters may change shape, and we will say so plainly when they do. What will not change is the constitution of the realm: standing is earned, the keys are yours, and every number you are shown is real.",
    ],
  },
];
