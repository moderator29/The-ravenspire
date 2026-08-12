import type { Rarity } from "@/lib/game/champions";

export interface GearItem {
  slug: string;
  name: string;
  slot: string;
  rarity: Rarity;
  effect: string;
  art: string;
}

const g = (
  slug: string,
  name: string,
  slot: string,
  rarity: Rarity,
  effect: string
): GearItem => ({ slug, name, slot, rarity, effect, art: `/game/gear/${slug}.png` });

export const gearCatalog: GearItem[] = [
  /* Helms */
  g("knight-helm", "Knight Helm", "helm", "common", "A trusted steel companion. +Defense."),
  g("warborn-helm", "Warborn Helm", "helm", "rare", "Forged in a losing battle that was won. +Defense, +Health."),
  g("spiked-greathelm", "Spiked Greathelm", "helm", "rare", "Discourages close conversation. Returns a sliver of melee damage."),
  g("raven-helm", "Raven Helm", "helm", "epic", "The Watch sees through its eyes. +Defense, warns of flanks."),
  g("gilded-crown", "Gilded Crown", "helm", "legendary", "Heavy is the head. Nearby allies gain resolve."),
  g("iron-crown", "Iron Crown", "helm", "epic", "Rule without ornament. +Defense when outnumbered."),
  g("hood-of-shadows", "Hood of Shadows", "helm", "epic", "Harder to target while moving."),
  g("face-guard", "Face Guard", "helm", "common", "Simple, honest protection."),
  g("noble-circlet", "Noble Circlet", "helm", "rare", "Glory gains rise slightly. Appearances matter."),
  g("death-mask", "Death Mask", "helm", "mythic", "The last face many ever see. Fear slows nearby foes."),
  /* Armor */
  g("knight-armor", "Knight Armor", "armor", "common", "The realm's standard plate. +Defense."),
  g("raven-mail", "Raven Mail", "armor", "epic", "Light as feathers, stubborn as beaks. +Defense, +Speed."),
  g("dread-maille", "Dread Maille", "armor", "rare", "Rings that remember every blow. +Health."),
  g("gilded-plate", "Gilded Plate", "armor", "legendary", "Wealth as armor. Blocks bite less."),
  g("shadow-cloak", "Shadow Cloak", "cloak", "epic", "Step between glances. Short burst of speed after a dodge."),
  g("fur-cloak", "Fur Cloak", "cloak", "common", "Warmth against the Long Night."),
  g("riven-leather", "Riven Leather", "armor", "rare", "Scarred, supple, fast. +Speed."),
  g("assassin-leather", "Assassin Leather", "armor", "epic", "First strike from silence hits harder."),
  g("battle-leather", "Battle Leather", "armor", "common", "Trusted by sellswords everywhere."),
  g("mage-robes", "Mage Robes", "armor", "rare", "Woven with quiet words. Power recharges faster."),
  /* Hands, feet, shields */
  g("gauntlets", "Gauntlets", "gloves", "common", "A firm grip on victory. +Attack."),
  g("vambraces", "Vambraces", "gloves", "rare", "Parry with confidence. +Defense."),
  g("leather-gloves", "Leather Gloves", "gloves", "common", "Nimble fingers, quicker strikes."),
  g("knight-boots", "Knight Boots", "boots", "common", "March further, arrive angrier."),
  g("steel-greaves", "Steel Greaves", "boots", "rare", "Immovable stance. +Defense."),
  g("raven-shield", "Raven Shield", "shield", "epic", "The sigil watches. Blocks cost less."),
  g("tower-shield", "Tower Shield", "shield", "rare", "A wall that walks. +Defense, -Speed."),
  g("kite-shield", "Kite Shield", "shield", "common", "Balanced cover for the charge."),
  g("buckler", "Buckler", "shield", "common", "Small, quick, insolent."),
  g("dual-shield", "Dual Shield", "shield", "legendary", "Why choose one wall when you can be two."),
  /* Accessories */
  g("belt-of-might", "Belt of Might", "belt", "rare", "+Attack. Hold your ground."),
  g("soldiers-belt", "Soldier's Belt", "belt", "common", "Carries what a battle needs."),
  g("ring-of-power", "Ring of Power", "ring", "legendary", "Ultimates strike wider."),
  g("ring-of-fortitude", "Ring of Fortitude", "ring", "rare", "+Health. Outlast them."),
  g("ring-of-precision", "Ring of Precision", "ring", "epic", "Critical strikes land more often."),
  g("amulet-of-glory", "Amulet of Glory", "necklace", "epic", "Glory streaks last a breath longer."),
  g("raven-talisman", "Raven Talisman", "necklace", "rare", "The Herald's favor. Small, constant luck."),
  g("dragon-pendant", "Dragon Pendant", "necklace", "mythic", "Old fire sleeps within. Power hits harder."),
  g("banner-of-war", "Banner of War", "banner", "epic", "Rally the line. Allies fight faster nearby."),
  g("quiver", "Quiver", "banner", "common", "Never count your last arrow."),
  /* Consumables */
  g("health-potion", "Health Potion", "consumable", "common", "Restores health mid-battle."),
  g("mana-potion", "Mana Potion", "consumable", "common", "Refreshes your power sooner."),
  g("elixir-of-strength", "Elixir of Strength", "consumable", "rare", "+Attack for one battle."),
  g("elixir-of-speed", "Elixir of Speed", "consumable", "rare", "+Speed for one battle."),
  g("revive-scroll", "Revive Scroll", "consumable", "epic", "Rise once more where you fell."),
  g("relic-chest", "Relic Chest", "consumable", "legendary", "Opens to treasures of the realm."),
  g("upgrade-stone", "Upgrade Stone", "material", "rare", "Raises a champion's mastery."),
  g("enchant-scroll", "Enchant Scroll", "material", "epic", "Binds a new property to gear."),
  g("blessing-orb", "Blessing Orb", "material", "legendary", "A maester's favor, crystallized."),
  g("summon-token", "Summon Token", "material", "epic", "Calls a new champion to your banner."),
];

export const gearBySlot = (slot: string) =>
  gearCatalog.filter((i) => i.slot === slot);
