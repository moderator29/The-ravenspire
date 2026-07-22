// Quests and duel prompts for the realm.
// Purely social and fun. No wagering, no crypto knowledge required.

export interface Quest {
  slug: string;
  name: string;
  desc: string;
  cadence: "daily" | "weekly" | "seasonal";
  glory: number;
  points: number;
  kind: "social" | "live" | "house" | "duel" | "streak" | "war";
}

export const quests: Quest[] = [
  // Daily quests (8)
  {
    slug: "welcome-a-newcomer",
    name: "Warden of the Gates",
    desc: "Greet a newcomer to the realm with a warm word. Every legend was once a stranger at the gate.",
    cadence: "daily",
    glory: 25,
    points: 15,
    kind: "social",
  },
  {
    slug: "send-a-worthy-raven",
    name: "A Worthy Raven",
    desc: "Send a message that earns three or more cheers. Make the raven proud of its cargo.",
    cadence: "daily",
    glory: 30,
    points: 20,
    kind: "social",
  },
  {
    slug: "attend-live-court",
    name: "Face at Court",
    desc: "Attend any live court session today. Lurking in the gallery counts, heckling politely counts double in spirit.",
    cadence: "daily",
    glory: 20,
    points: 10,
    kind: "live",
  },
  {
    slug: "cheer-the-crowd",
    name: "Voice of the Crowd",
    desc: "Cast five cheers on posts from Houses other than your own. Generosity travels farther than gold.",
    cadence: "daily",
    glory: 20,
    points: 10,
    kind: "social",
  },
  {
    slug: "enter-a-duel",
    name: "Step Into the Circle",
    desc: "Enter a duel of wit today. Win or lose, the crowd remembers those who dared to speak.",
    cadence: "daily",
    glory: 35,
    points: 25,
    kind: "duel",
  },
  {
    slug: "vote-in-a-duel",
    name: "Judge of the Circle",
    desc: "Cast your vote in any duel of wit. The crowd decides, and today the crowd is you.",
    cadence: "daily",
    glory: 20,
    points: 10,
    kind: "duel",
  },
  {
    slug: "banner-check-in",
    name: "Raise the Banner",
    desc: "Check in at your House hall today. A House is only as strong as the banners that show up.",
    cadence: "daily",
    glory: 25,
    points: 15,
    kind: "house",
  },
  {
    slug: "war-skirmish",
    name: "Skirmish at Dawn",
    desc: "Play one War battle today. Fortune favors the bold, and so does the scoreboard.",
    cadence: "daily",
    glory: 40,
    points: 30,
    kind: "war",
  },

  // Weekly quests (6)
  {
    slug: "win-a-duel-of-wit",
    name: "Sharpest Tongue in the Realm",
    desc: "Win a duel of wit this week by earning the crowd's favor. Steel rusts, a good line never does.",
    cadence: "weekly",
    glory: 120,
    points: 75,
    kind: "duel",
  },
  {
    slug: "host-a-room",
    name: "Keeper of the Hearth",
    desc: "Host a live room this week and keep at least five guests warm by your fire.",
    cadence: "weekly",
    glory: 150,
    points: 90,
    kind: "live",
  },
  {
    slug: "seven-day-streak",
    name: "The Unbroken Vigil",
    desc: "Show up seven days in a row. Kingdoms fall to those who simply keep arriving.",
    cadence: "weekly",
    glory: 200,
    points: 120,
    kind: "streak",
  },
  {
    slug: "house-rally",
    name: "Rally the Banners",
    desc: "Join a House rally this week and stand shoulder to shoulder with your kin.",
    cadence: "weekly",
    glory: 130,
    points: 80,
    kind: "house",
  },
  {
    slug: "befriend-three-realms",
    name: "Envoy of Six Banners",
    desc: "Strike up conversations with members of three different Houses this week. Diplomacy, but make it fun.",
    cadence: "weekly",
    glory: 110,
    points: 70,
    kind: "social",
  },
  {
    slug: "war-campaign",
    name: "The Long March",
    desc: "Play five War battles this week. Not every march ends in triumph, but every march counts.",
    cadence: "weekly",
    glory: 160,
    points: 100,
    kind: "war",
  },

  // Seasonal quests (4)
  {
    slug: "season-of-courts",
    name: "Fixture of the Court",
    desc: "Attend twelve live court sessions this season. By the end, the throne room will feel like your living room.",
    cadence: "seasonal",
    glory: 350,
    points: 180,
    kind: "live",
  },
  {
    slug: "duel-champion",
    name: "Champion of the Circle",
    desc: "Win ten duels of wit this season. Retire the season with a reputation and several excellent grudges.",
    cadence: "seasonal",
    glory: 500,
    points: 250,
    kind: "duel",
  },
  {
    slug: "pillar-of-the-house",
    name: "Pillar of the House",
    desc: "Earn a spot among your House's top contributors this season. Legends are built one rally at a time.",
    cadence: "seasonal",
    glory: 450,
    points: 220,
    kind: "house",
  },
  {
    slug: "grand-war-veteran",
    name: "Veteran of the Grand War",
    desc: "Fight in twenty War battles this season. When the bards sing of this war, make sure your name scans well.",
    cadence: "seasonal",
    glory: 400,
    points: 200,
    kind: "war",
  },
];

export interface DuelPrompt {
  slug: string;
  prompt: string;
}

export const duelPrompts: DuelPrompt[] = [
  {
    slug: "worst-quest-ever",
    prompt: "Hot take battle: pitch the worst quest a monarch could ever assign, and defend it like your title depends on it.",
  },
  {
    slug: "dragon-roommate",
    prompt: "Convince the crowd that living with a dragon is better than living with a bard. Your opponent argues the reverse.",
  },
  {
    slug: "roast-my-banner",
    prompt: "Roast format: your opponent's House banner has just been unveiled. Deliver the kindest, cruelest review in the realm.",
  },
  {
    slug: "riddle-of-the-gate",
    prompt: "Riddle duel: each of you poses one riddle to the crowd. The riddle that stumps and delights the most wins the gate.",
  },
  {
    slug: "throne-or-library",
    prompt: "Hot take battle: would you rather rule the realm from a golden throne or know everything from a hidden library? Pick a side and make it sting.",
  },
  {
    slug: "excuse-for-the-king",
    prompt: "You arrived late to the royal feast. Invent the most magnificent excuse ever spoken. The crowd crowns the boldest liar, in good fun.",
  },
  {
    slug: "sell-the-cursed-sword",
    prompt: "Merchant's duel: sell the crowd an obviously cursed sword. Best sales pitch wins, refunds not included.",
  },
  {
    slug: "winter-versus-summer",
    prompt: "Hot take battle: endless winter or endless summer for the realm? Argue your season like a true zealot of the weather.",
  },
  {
    slug: "roast-the-prophecy",
    prompt: "Roast format: a prophecy has foretold your opponent's glorious destiny. Explain, line by line, why the prophecy clearly needs an editor.",
  },
  {
    slug: "last-meal-in-the-realm",
    prompt: "Defend one dish as the realm's finest final feast. Your opponent defends another. The crowd eats with their votes.",
  },
  {
    slug: "riddle-of-the-raven",
    prompt: "Riddle duel: compose a riddle a raven could carry in one breath. Shortest riddle that still baffles the crowd takes the day.",
  },
  {
    slug: "advice-for-a-young-knight",
    prompt: "Hot take battle: give a young knight one piece of advice. Your opponent gives the opposite advice. The crowd decides who ruins fewer knights.",
  },
];
