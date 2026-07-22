// Arsenal: legendary weapons and gear slots for the realm.
// All names and lore are original to this project.

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export interface Weapon {
  slug: string;
  name: string;
  class: string;
  rarity: Rarity;
  effect: string;
  lore: string;
  art?: string;
}

export interface GearSlot {
  slug: string;
  name: string;
  desc: string;
}

export const legendaryWeapons: Weapon[] = [
  {
    slug: "nightfall",
    name: "Nightfall",
    class: "longsword",
    rarity: "mythic",
    effect: "Strikes land in silence, and the crowd swears the torches dim for a heartbeat.",
    lore: "Forged in the sunless vaults of House Nightvale, it has never once been drawn in daylight.",
    art: "/game/weapons/nightfall.png",
  },
  {
    slug: "dawnbringer",
    name: "Dawnbringer",
    class: "greatsword",
    rarity: "mythic",
    effect: "Its first swing of any duel blazes like sunrise, blinding all who doubt you.",
    lore: "Legend says it was quenched in the light of a morning that lasted three days.",
    art: "/game/weapons/dawnbringer.png",
  },
  {
    slug: "widows-kiss",
    name: "Widow's Kiss",
    class: "dagger",
    rarity: "legendary",
    effect: "One clean strike, then it vanishes back to your belt before anyone can gasp.",
    lore: "Nightvale courtiers gift it at weddings, which tells you everything about Nightvale weddings.",
    art: "/game/weapons/widows-kiss.png",
  },
  {
    slug: "oathkeeper",
    name: "Oathkeeper",
    class: "longsword",
    rarity: "legendary",
    effect: "Grows heavier in the hand of anyone who breaks a promise while holding it.",
    lore: "Sworn to House Corvane, its hilt bears an obsidian raven that seems to keep score.",
    art: "/game/weapons/oathkeeper.png",
  },
  {
    slug: "frostfang",
    name: "Frostfang",
    class: "blade of ice",
    rarity: "legendary",
    effect: "Every parry leaves a rime of frost that slows the boldest of blades.",
    lore: "Cut from a glacier heart by the smiths of House Frosthold, it has never known a warm day.",
    art: "/game/weapons/frostfang.png",
  },
  {
    slug: "emberedge",
    name: "Emberedge",
    class: "flaming sword",
    rarity: "legendary",
    effect: "The blade smolders brighter with every exchange, rewarding those who press the attack.",
    lore: "House Emberfall claims it lit the first beacon of the realm, and no one dares argue.",
    art: "/game/weapons/emberedge.png",
  },
  {
    slug: "kingsblade",
    name: "Kingsblade",
    class: "greatsword",
    rarity: "mythic",
    effect: "Commands the field, granting its bearer the first word and the last swing.",
    lore: "Seven rulers carried it, and seven rulers swore it whispered better counsel than their advisors.",
    art: "/game/weapons/kingsblade.png",
  },
  {
    slug: "needle",
    name: "Needle",
    class: "thin blade",
    rarity: "legendary",
    effect: "Slips through the smallest gap in any guard, precise as a tailor and twice as ruthless.",
    lore: "Made for a duelist too small for a proper sword, who then out fenced everyone with a proper sword.",
    art: "/game/weapons/needle.png",
  },
  {
    slug: "ironmaul",
    name: "Ironmaul",
    class: "warhammer",
    rarity: "legendary",
    effect: "Ignores shields entirely, on the theory that everything is a nail eventually.",
    lore: "Frosthold smiths built it to crack fortress gates, then discovered it also settles arguments.",
    art: "/game/weapons/ironmaul.png",
  },
  {
    slug: "stormreaver",
    name: "Stormreaver",
    class: "battleaxe",
    rarity: "legendary",
    effect: "Each swing carries a thunderclap that rattles armor and nerves alike.",
    lore: "House Stormcrest raiders say it was pulled from the wreck of a ship struck twice by lightning.",
    art: "/game/weapons/stormreaver.png",
  },
  {
    slug: "voidscythe",
    name: "Voidscythe",
    class: "war scythe",
    rarity: "mythic",
    effect: "Its arc leaves a ribbon of darkness that foes hesitate to cross, and hesitation loses duels.",
    lore: "Nightvale reapers carried it at harvest, though no one ever saw what crop they gathered.",
    art: "/game/weapons/voidscythe.png",
  },
  {
    slug: "dragonspine",
    name: "Dragonspine",
    class: "greatsword",
    rarity: "mythic",
    effect: "Too vast for lesser arms, it cleaves through steel as if steel were a rumor.",
    lore: "Ground from the ridge bone of the last great wyrm, it still radiates a faint, patient heat.",
    art: "/game/weapons/dragonspine.png",
  },
  {
    slug: "ravenbow",
    name: "Ravenbow",
    class: "longbow",
    rarity: "legendary",
    effect: "Its arrows bank on the wind like clever birds, finding marks around cover.",
    lore: "Strung with gold wire by House Corvane, whose archers famously never miss twice.",
    art: "/game/weapons/ravenbow.png",
  },
  {
    slug: "heartrender",
    name: "Heartrender",
    class: "spear",
    rarity: "legendary",
    effect: "Always aims true toward the center of things, be it a shield wall or a rivalry.",
    lore: "Won and lost in a hundred tourneys, it is said to choose its champion, not the reverse.",
    art: "/game/weapons/heartrender.png",
  },
  {
    slug: "soulspike",
    name: "Soulspike",
    class: "morningstar",
    rarity: "legendary",
    effect: "Every blow lands with the weight of an old grudge, staggering foes twice its size.",
    lore: "An Emberfall relic cooled in ash and vinegar, forged by a smith who forgave nothing.",
    art: "/game/weapons/soulspike.png",
  },
];

export const gearSlots: GearSlot[] = [
  {
    slug: "helmets",
    name: "Helmets",
    desc: "Crowned steel for the head that wears the plan, from raven visors to lion crests.",
  },
  {
    slug: "armors",
    name: "Armors",
    desc: "Breastplates and hauberks that turn blades aside and turn heads at court.",
  },
  {
    slug: "cloaks",
    name: "Cloaks",
    desc: "Dramatic by design, warm by accident, mandatory for windswept entrances.",
  },
  {
    slug: "shoulders",
    name: "Shoulders",
    desc: "Pauldrons broad enough to carry a house sigil and the expectations that come with it.",
  },
  {
    slug: "gloves",
    name: "Gloves",
    desc: "Gauntlets and grips for sword hands, bow hands, and the occasional thrown gauntlet.",
  },
  {
    slug: "boots",
    name: "Boots",
    desc: "March all day, dance all night, kick down the odd portcullis in between.",
  },
  {
    slug: "shields",
    name: "Shields",
    desc: "Painted bulwarks that stop arrows and advertise exactly whom you fight for.",
  },
  {
    slug: "belts",
    name: "Belts",
    desc: "Holds the scabbard, the coin pouch, and the whole ensemble together.",
  },
  {
    slug: "rings",
    name: "Rings",
    desc: "Signets and charms, small enough to hide, potent enough to seal a pact.",
  },
  {
    slug: "necklaces",
    name: "Necklaces",
    desc: "Amulets and chains that glimmer at the throat and whisper of old favors owed.",
  },
  {
    slug: "relics",
    name: "Relics",
    desc: "Ancient oddities of uncertain purpose and undeniable bragging rights.",
  },
  {
    slug: "banners",
    name: "Banners",
    desc: "Fly your colors high so allies rally and rivals rehearse their excuses.",
  },
  {
    slug: "potions",
    name: "Potions",
    desc: "Bottled courage, liquid luck, and at least one flask nobody has dared to open.",
  },
  {
    slug: "mounts",
    name: "Mounts",
    desc: "Destriers, dire elk, and stranger steeds for arriving in unforgettable style.",
  },
];
