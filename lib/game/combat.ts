import type { Champion } from "@/lib/game/champions";

/* CHAMPION COMBAT PROFILES

   The War engine used to fight every champion identically — a hardcoded attack,
   one speed, one ultimate — so the roster's passives and ultimates were pure
   flavor. This module turns each champion's real stats and their written
   passive/ultimate into a machine-readable combat profile the engine actually
   plays: attack and pace scale from stats, defense becomes real damage
   reduction, and each hero's passive + ultimate map to a concrete mechanic.

   The mapping is derived once from the champion's own data (keywords in the
   passive/ultimate text), so a new champion added to champions.ts automatically
   inherits a fitting kit with no engine change. Deterministic and framework
   free — safe to call anywhere. */

export type PassiveKind =
  | "lifesteal"
  | "crit"
  | "execute"
  | "thorns"
  | "bulwark"
  | "ignite"
  | "swift"
  | "deathless";

export type UltimateKind =
  | "nuke"
  | "cleave"
  | "multistrike"
  | "heal"
  | "shield"
  | "stun";

export interface CombatProfile {
  hp: number;
  atk: number;
  /* Seconds between auto-attacks; lower is faster. */
  attackInterval: number;
  moveSpeed: number;
  range: number;
  /* 0..0.5 — fraction of incoming damage shrugged off (from Defense). */
  damageReduction: number;

  passive: PassiveKind;
  passiveName: string;
  lifesteal: number; // fraction of damage dealt returned as health
  critChance: number;
  critMul: number;
  executeBonus: number; // extra damage multiplier vs foes under 40% health
  thorns: number; // fraction of damage taken reflected to the attacker
  ignite: number; // burn-per-second as a fraction of attack, applied on hit
  deathless: boolean; // survive the first lethal blow at 1 health

  ultimate: UltimateKind;
  ultName: string;
  ultDamageMul: number;
  ultRadius: number;
}

const RANGED = new Set([
  "Bow",
  "Crossbow",
  "Thrown",
  "Staff",
  "Instrument",
]);
const REACH = new Set(["Polearm", "Whip"]);

function has(text: string, ...needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

/* Map the champion's written passive to a concrete mechanic. Order matters:
   the most defining keyword wins. */
function readPassive(c: Champion): {
  kind: PassiveKind;
  lifesteal: number;
  critChance: number;
  critMul: number;
  executeBonus: number;
  thorns: number;
  ignite: number;
  deathless: boolean;
} {
  const text = `${c.passive.name} ${c.passive.desc}`;
  const base = {
    kind: "crit" as PassiveKind,
    lifesteal: 0,
    critChance: 0,
    critMul: 1,
    executeBonus: 0,
    thorns: 0,
    ignite: 0,
    deathless: false,
  };

  if (has(text, "survive", "would fall", "deathless", "one health")) {
    return { ...base, kind: "deathless", deathless: true };
  }
  if (
    has(text, "heal", "lifesteal", "drink", "drinks", "absorb", "healing", "regenerate")
  ) {
    return { ...base, kind: "lifesteal", lifesteal: 0.28 };
  }
  if (has(text, "reflect", "thorn", "back at", "reflecting", "redirect")) {
    return { ...base, kind: "thorns", thorns: 0.3 };
  }
  if (
    has(text, "below half", "low health", "wounded", "scent of victory", "final", "lost")
  ) {
    return { ...base, kind: "execute", executeBonus: 0.7 };
  }
  if (has(text, "ignite", "burn", "fire", "ember", "flame", "scorch", "cinder")) {
    return { ...base, kind: "ignite", ignite: 0.22 };
  }
  if (
    has(
      text,
      "reduced damage",
      "half damage",
      "barrier",
      "cannot be knocked",
      "stacking defense",
      "hardens",
      "permafrost",
      "ignores the first",
      "shrug",
      "thick",
      "unshakable",
      "unmoved"
    )
  ) {
    return { ...base, kind: "bulwark" };
  }
  if (has(text, "speed", "faster", "acts first", "tailwind", "quick", "swift", "dodge", "evade")) {
    return { ...base, kind: "swift" };
  }
  // Default: a measured critical striker.
  return { ...base, kind: "crit", critChance: 0.22, critMul: 1.8 };
}

function readUltimate(c: Champion): {
  kind: UltimateKind;
  ultDamageMul: number;
  ultRadius: number;
} {
  const text = `${c.ultimate.name} ${c.ultimate.desc}`;
  if (has(text, "heal", "reviv", "restore", "sunrise", "ashes")) {
    return { kind: "heal", ultDamageMul: 2.6, ultRadius: 0.3 };
  }
  if (has(text, "shield", "barrier", "invulnerable", "bulwark", "wall", "phalanx")) {
    return { kind: "shield", ultDamageMul: 2.4, ultRadius: 0.3 };
  }
  if (
    has(text, "stun", "freeze", "frozen", "stagger", "blind", "silenc", "quake", "deafen")
  ) {
    return { kind: "stun", ultDamageMul: 3, ultRadius: 0.34 };
  }
  if (
    has(text, "twice", "three", "nine", "every enemy twice", "fan of", "storm of", "rain")
  ) {
    return { kind: "multistrike", ultDamageMul: 2.2, ultRadius: 0.32 };
  }
  if (
    has(text, "single", "one enemy", "colossal", "massive damage to", "chosen enemy", "king's ransom")
  ) {
    return { kind: "nuke", ultDamageMul: 7.5, ultRadius: 0.12 };
  }
  // Default: a wide cleave across the enemy line.
  return { kind: "cleave", ultDamageMul: 3.6, ultRadius: 0.36 };
}

/* Plain-language effect of a passive, so the battle intro can tell the player
   what their champion actually does — not just flavor. */
export function passiveEffectText(kind: PassiveKind): string {
  switch (kind) {
    case "lifesteal":
      return "Heals for a share of all damage dealt.";
    case "crit":
      return "Chance to land a heavy critical strike.";
    case "execute":
      return "Deals bonus damage to badly wounded foes.";
    case "thorns":
      return "Reflects part of every blow back at attackers.";
    case "bulwark":
      return "Hardened defense — takes sharply reduced damage.";
    case "ignite":
      return "Strikes set foes alight, burning them over time.";
    case "swift":
      return "Attacks faster and moves quicker across the field.";
    case "deathless":
      return "Survives the first lethal blow at a sliver of life.";
  }
}

const ULT_TEXT: Record<UltimateKind, string> = {
  nuke: "Focuses one enemy with a colossal single blow.",
  cleave: "Sweeps the whole enemy press in one wide arc.",
  multistrike: "Strikes every nearby foe twice in a breath.",
  heal: "Damages foes and heals your host around you.",
  shield: "Damages foes and shields your host around you.",
  stun: "Damages and freezes every nearby foe in place.",
};

export function ultimateEffectText(kind: UltimateKind): string {
  return ULT_TEXT[kind];
}

/* A short playstyle tag for the champion, derived from their kit. */
export function playstyleTag(p: CombatProfile): string {
  if (p.passive === "bulwark" || p.deathless) return "Vanguard";
  if (p.lifesteal > 0) return "Bloodletter";
  if (p.passive === "ignite") return "Pyre";
  if (p.passive === "swift") return "Skirmisher";
  if (p.passive === "execute") return "Headtaker";
  if (p.passive === "thorns") return "Retaliator";
  return "Duelist";
}

export function buildCombatProfile(c: Champion): CombatProfile {
  const st = c.stats;
  const p = readPassive(c);
  const u = readUltimate(c);

  const ranged = RANGED.has(c.weaponClass);
  const reach = REACH.has(c.weaponClass);

  // Bulwark leans on defense: heavier reduction and a sturdier body.
  const drBoost = p.kind === "bulwark" ? 1.25 : 1;
  const damageReduction = Math.min(0.5, (st.defense / 3600) * drBoost);

  // Swift heroes trade a little punch for a faster blade.
  const speedInterval = 0.92 - st.speed / 900;
  const attackInterval = Math.max(
    0.34,
    p.kind === "swift" ? speedInterval - 0.06 : speedInterval
  );

  return {
    hp: 240 + st.health * 0.019 + st.defense * 0.03,
    atk: 22 + st.attack / 160,
    attackInterval,
    moveSpeed: 0.055 + st.speed / 12000,
    range: ranged ? 0.16 : reach ? 0.09 : 0.055,
    damageReduction,

    passive: p.kind,
    passiveName: c.passive.name,
    lifesteal: p.lifesteal,
    critChance: p.critChance,
    critMul: p.critMul,
    executeBonus: p.executeBonus,
    thorns: p.thorns,
    ignite: p.ignite,
    deathless: p.deathless,

    ultimate: u.kind,
    ultName: c.ultimate.name,
    ultDamageMul: u.ultDamageMul,
    ultRadius: u.ultRadius,
  };
}
