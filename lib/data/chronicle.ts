export interface ChronicleSection {
  slug: string;
  title: string;
  plain: string;
  body: string[];
}

export const chronicle: ChronicleSection[] = [
  {
    slug: "what-is-ravenspire",
    title: "What Is The Ravenspire",
    plain: "A fun-first social realm where wit earns standing.",
    body: [
      "The Ravenspire is a social platform dressed in castle stone. You post, you jest, you make bold Calls about what happens next, and the realm remembers who was sharp and who was merely loud. It is a game of reputation, played with words.",
      "Everything here runs on one currency that money cannot buy: being interesting. There is no pay-to-win gate, no velvet rope for the wealthy. A smallfolk account with a quick tongue can outshine a crowned veteran on any given day, and often does.",
      "We built The Ravenspire fun-first, on purpose. It is a place to compete, banter, and build a name. It is not a casino, not a market for speculation, and not a scheme. If a feature ever stops being fun, it has failed, and we treat it that way.",
    ],
  },
  {
    slug: "the-ravenry",
    title: "The Ravenry",
    plain: "The feed. Posts fly like ravens, and Calls put your wit on record.",
    body: [
      "The Ravenry is the beating heart of the realm, the feed where every message lands. Post a thought, a jest, a challenge, or a boast, and it takes wing for the whole realm to see. Replies, reposts, and reactions work the way you would expect, only with more drama.",
      "The signature move of the Ravenry is the Call. A Call is a public claim about something that has not happened yet, sealed and timestamped, so that when the dust settles everyone can see who read the winds correctly. Calls are about bragging rights and Renown, nothing else.",
      "Because a Call is permanent, it changes how people post. Cheap hot takes get remembered. Careful, clever reads get celebrated. Over time the Ravenry becomes a public record of judgment, and the realm learns exactly whose word carries weight.",
    ],
  },
  {
    slug: "houses-and-renown",
    title: "Houses and Renown",
    plain: "Pick a House, earn Renown, climb from Smallfolk to the throne.",
    body: [
      "Every citizen of The Ravenspire swears to one of six Houses. House Corvane keeps its ravens and its cunning. House Emberfall burns bold. House Frosthold endures anything. House Stormcrest strikes fast. House Nightvale trades in secrets. House Goldmane hunts glory with a lion's patience. Your House is your banner, your rivalry, and your team.",
      "Renown is the realm's measure of standing, and it is earned only by participating: posting well, calling shots correctly, showing up for your House. It climbs through tiers, from Smallfolk through the ranks of the court, all the way to King or Queen. Each tier is visible on your profile, so your standing is never a rumor.",
      "Renown cannot be purchased, transferred, or quietly gifted by a friend in high places. The only road up is the long one, and that is precisely what makes the top worth reaching.",
    ],
  },
  {
    slug: "crests",
    title: "Crests",
    plain: "Badges of deed. Earned, never bought, and never NFTs.",
    body: [
      "Crests are the medals of The Ravenspire, marks struck for real deeds: a legendary Call, a season survived, a rivalry won, a moment the realm will not forget. They live on your profile like a coat of arms that tells your story at a glance.",
      "Every Crest is earned. There is no shop, no price tag, and no back door. If you see a Crest on someone's profile, you know they did the thing, because there is no other way to get one.",
      "To be plain about what Crests are not: they are not NFTs, not tokens, and not tradable assets of any kind. They cannot be sold, swapped, or speculated on. A Crest is worth exactly what a medal is worth, which is to say, everything to the person who earned it and nothing on a market.",
    ],
  },
  {
    slug: "the-games",
    title: "The Games",
    plain: "Claim the Throne and The War, the realm's two great contests.",
    body: [
      "Claim the Throne is the House rivalry that runs the Season. You swear to a House and earn Glory through purely social play: daily quests, duels of wit voted by the crowd, streaks, courts hosted and newcomers welcomed. Every member's Glory feeds their banner, and when the Season closes, the top House claims the Throne, the bragging rights, and the Season's reward vault.",
      "The War: Battle for the Realm is the flagship game. Collect champions across the rarities, arm them from the legendary arsenal, raise their mastery, and lead them into real-time battle on the realm's battlefields. Victories, kills and unbroken streaks earn Glory that flows back into your House's Season.",
      "Both games are contests of skill, wit, and participation. There is no buy-in, no wagering, and nothing at stake but glory and standing. You play by showing up and being good, and the scoreboard does the rest.",
    ],
  },
  {
    slug: "create-to-earn",
    title: "Create to Earn",
    plain: "Points for participation, claimed each Season to a wallet only you control.",
    body: [
      "Everything you do in The Ravenspire earns points: posting, making Calls, fighting for your House, keeping the realm alive. Points accumulate across a Season as a straightforward measure of contribution. No luck, no lottery, just a ledger of what you actually did.",
      "At the close of each Season, contributions are tallied and published in a merkle tree, a cryptographic summary that lets anyone verify their share independently. If you have something to claim, you claim it yourself, directly to your own wallet, through a claim we cannot alter or intercept.",
      "The claim is non-custodial from end to end. The Ravenspire never holds your rewards on your behalf, never takes possession in the middle, and never stands between you and what you earned. We publish the tree, you make the claim, and the record is open for anyone to check.",
      "One honest note, stated plainly: points reward participation and creativity. They are not an investment, and nothing here promises financial return. Come for the fun. Anything else is a bonus you verify yourself.",
    ],
  },
  {
    slug: "your-wallet",
    title: "Your Wallet",
    plain: "Non-custodial and exportable. We never hold your keys, ever.",
    body: [
      "Every citizen gets a wallet, and here is the part that matters: it is yours in the fullest sense. The keys are generated for you alone, we never see them, and we never store them. The Ravenspire cannot move your funds, freeze your wallet, or recover your keys, because we simply do not have them.",
      "Your wallet is exportable at any time. Take your keys to any standard wallet application and carry on without us. There is no lock-in, no exit fee, and no permission to ask. If The Ravenspire vanished tomorrow, everything in your wallet would still be exactly where you left it, under your control.",
      "This design is deliberate. Custody is a promise platforms often make and sometimes break. We chose the architecture where the promise cannot be broken, because there is nothing for us to hold in the first place. Guard your keys well, for no one, including us, can restore them for you.",
    ],
  },
  {
    slug: "the-chapters-ahead",
    title: "The Chapters Ahead",
    plain: "The roadmap: Mint, Forge, Prophecies, the full Raven, and the Long Night.",
    body: [
      "The Ravenspire is a realm under construction, and we would rather show you the map than pretend the castle is finished. What exists today is the foundation: the Ravenry, the Houses, Renown, Crests, and the first Games.",
      "The Forge already stands at the gates: the realm's staking hall, where oaths sworn in $RSP earn real yield from protocol fees, never emissions. Its fires light fully when staking goes live on-chain.",
      "The chapters ahead: the Mint, trading across chains shielded from MEV and gasless. Prophecies, on-chain prediction markets where you call the market and win the realm. The Raven, Unbound, the full autonomous agent that trades, watches and hunts alpha at your word. And the Long Night, the co-op survival event where the realm holds the Wall together when markets crash.",
      "Roadmaps are intentions, not oaths. Order may shift, chapters may change shape, and we will say so plainly when they do. What will not change is the constitution of the realm: fun first, standing earned, keys yours, always.",
    ],
  },
];
