"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Champion } from "@/lib/game/champions";
import { champions } from "@/lib/game/champions";
import {
  buildCombatProfile,
  passiveEffectText,
  ultimateEffectText,
  playstyleTag,
} from "@/lib/game/combat";
import { Icon } from "@/components/ui/icon";

/*
  The War, real-time and simple. Your champion leads a small host against an
  enemy army that streams in without pause. The hero auto-fights so the field
  is never idle; the player commands a Dash strike, an Ultimate blast and a
  Shield. Clear the whole enemy army to win. Every foe felled builds Glory,
  which the battle page banks server side (the engine only reports the tally).

  Design notes on the founder's feedback:
  - No dead time. Foes stream continuously from a fixed army budget, so there
    are no silent gaps between waves.
  - The hero acts on its own. Tapping is for power, not for basic survival, so
    it never feels stuck or "paused".
  - The goal is legible. A foes-remaining bar shows exactly how close victory is.
*/

export interface BattleOutcome {
  result: "victory" | "defeat";
  kills: number;
  glory: number;
  duration_s: number;
}

interface Unit {
  id: number;
  team: 0 | 1; // 0 = your host, 1 = the enemy
  hero: boolean;
  x: number; // fraction 0..1 across the field
  y: number; // fraction 0..1 down the field
  hp: number;
  maxHp: number;
  atk: number;
  range: number;
  speed: number;
  size: number;
  cooldown: number;
  /* Seconds between this unit's auto-attacks (champion pace). */
  attackInterval: number;
  alive: boolean;
  hitFlash: number;
  lunge: number;
  shield: number;
  img: HTMLImageElement | null;

  /* Champion combat kit (defaults 0/false for rank-and-file units). */
  dr: number; // damage reduction 0..0.5
  lifesteal: number;
  critChance: number;
  critMul: number;
  executeBonus: number;
  thorns: number;
  ignite: number; // burn dps as a fraction of atk, applied on hit
  deathless: boolean;
  deathlessUsed: boolean;
  burn: number; // seconds of burn remaining on this unit
  burnDps: number; // burn damage per second while burning
  stun: number; // seconds this unit is frozen/stunned
}
interface Float {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}
interface Slash {
  x: number;
  y: number;
  life: number;
  team: 0 | 1;
}

/* The enemy army size per battlefield. These MUST match FOE_COUNTS in
   app/api/war/battle/route.ts so the client tally and the banked reward agree. */
const FIELD_FOES: Record<string, number> = {
  "river-crossing": 26,
  "castle-siege": 30,
  "snow-valley": 24,
  "dark-fortress": 32,
};
/* A safety ceiling so a stalled field still resolves. Victory is normally by
   clearing the army, which lands well under this. */
const MAX_SECONDS = 120;
/* Illustrative season conversion, shown to players. Not a promise. */
const GLORY_PER_RSP = 1000;

export function BattleEngine({
  champion,
  mastery,
  field,
  onEnd,
}: {
  champion: Champion;
  mastery: number;
  field: string;
  onEnd: (o: BattleOutcome) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<"howto" | "playing">("howto");
  const [landscape, setLandscape] = useState(true);
  const totalFoes = FIELD_FOES[field] ?? 26;
  const [hud, setHud] = useState({
    heroHp: 1,
    time: 0,
    kills: 0,
    remaining: totalFoes,
    streak: 1,
    glory: 0,
    ultReady: 0,
    shieldReady: 0,
    dashReady: 0,
  });

  /* Live game state kept in refs so the animation loop never re-renders. */
  const stateRef = useRef({
    units: [] as Unit[],
    floats: [] as Float[],
    slashes: [] as Slash[],
    nextId: 1,
    kills: 0,
    streak: 1,
    elapsed: 0,
    spawned: 0, // foes released from the army budget so far
    budget: totalFoes,
    ended: false,
    ultCd: 0,
    shieldCd: 0,
    dashCd: 0,
    lastHudPush: 0,
  });
  const imgs = useRef<Record<string, HTMLImageElement>>({});
  const ended = useRef(false);

  /* Orientation: a landscape phone (or any wide screen) fights best, but a
     portrait phone can still play, so we never hard block, only nudge. */
  useEffect(() => {
    const check = () => {
      const wide =
        typeof window !== "undefined" &&
        window.innerWidth >= window.innerHeight;
      setLandscape(wide || window.innerWidth >= 900);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  /* Preload champion art for the hero, the enemy champion and the host. */
  useEffect(() => {
    const withArt = champions.filter((c) => c.art);
    const pool = [champion, ...withArt].filter(
      (c, i, a) => a.findIndex((x) => x.slug === c.slug) === i
    );
    pool.forEach((c) => {
      if (!c.art || imgs.current[c.slug]) return;
      const im = new Image();
      im.src = c.art;
      imgs.current[artSlug(c.art)] = im;
    });
  }, [champion]);

  const foeArt = useCallback(
    (i: number) => {
      const foes = champions.filter((c) => c.art && c.slug !== champion.slug);
      return foes[i % foes.length]?.art;
    },
    [champion]
  );

  const spawnHost = useCallback(() => {
    const s = stateRef.current;
    const withArt = champions.filter((c) => c.art && c.slug !== champion.slug);

    /* The chosen champion's real combat kit — attack, pace, reach, damage
       reduction and their passive/ultimate mechanics all flow from here, so
       every champion actually plays to their stats and their written kit. */
    const prof = buildCombatProfile(champion);
    const heroHp = prof.hp + mastery * 24;

    const mk = (
      team: 0 | 1,
      hero: boolean,
      x: number,
      y: number,
      art: string | undefined,
      hp: number,
      atk: number
    ): Unit => ({
      id: s.nextId++,
      team,
      hero,
      x,
      y,
      hp,
      maxHp: hp,
      atk,
      range: hero ? prof.range : 0.05,
      speed: hero ? prof.moveSpeed : 0.062,
      size: hero ? 0.095 : 0.052,
      cooldown: 0,
      attackInterval: hero ? prof.attackInterval : 0.9,
      alive: true,
      hitFlash: 0,
      lunge: 0,
      shield: 0,
      img: art ? (imgs.current[artSlug(art)] ?? null) : null,
      dr: hero ? prof.damageReduction : 0,
      lifesteal: hero ? prof.lifesteal : 0,
      critChance: hero ? prof.critChance : 0,
      critMul: hero ? prof.critMul : 1,
      executeBonus: hero ? prof.executeBonus : 0,
      thorns: hero ? prof.thorns : 0,
      ignite: hero ? prof.ignite : 0,
      deathless: hero ? prof.deathless : false,
      deathlessUsed: false,
      burn: 0,
      burnDps: 0,
      stun: 0,
    });

    /* Your hero (kitted from the profile) and a small line of the host. */
    s.units.push(mk(0, true, 0.16, 0.55, champion.art, heroHp, prof.atk));
    const allyArt = withArt.slice(0, 4);
    for (let i = 0; i < 3; i++) {
      s.units.push(
        mk(0, false, 0.09 + (i % 2) * 0.05, 0.34 + i * 0.14, allyArt[i]?.art, 70, 11)
      );
    }
  }, [champion, mastery]);

  /* Release a single foe from the army budget, streaming in from the right. */
  const releaseFoe = useCallback(
    (idx: number) => {
      const s = stateRef.current;
      const hp = 42 + Math.floor(s.spawned / 6) * 6;
      s.units.push({
        id: s.nextId++,
        team: 1,
        hero: false,
        x: 1.02 + (idx % 3) * 0.03,
        y: 0.26 + ((idx * 37) % 60) / 100,
        hp,
        maxHp: hp,
        atk: 9 + Math.floor(s.spawned / 8),
        range: 0.05,
        speed: 0.06 + ((idx * 13) % 5) * 0.004,
        size: 0.052,
        cooldown: ((idx * 7) % 10) / 10,
        attackInterval: 0.9,
        alive: true,
        hitFlash: 0,
        lunge: 0,
        shield: 0,
        img: imgs.current[artSlug(foeArt(idx) ?? "")] ?? null,
        dr: 0,
        lifesteal: 0,
        critChance: 0,
        critMul: 1,
        executeBonus: 0,
        thorns: 0,
        ignite: 0,
        deathless: false,
        deathlessUsed: false,
        burn: 0,
        burnDps: 0,
        stun: 0,
      });
      s.spawned += 1;
    },
    [foeArt]
  );

  const finish = useCallback(
    (result: "victory" | "defeat") => {
      if (ended.current) return;
      ended.current = true;
      const s = stateRef.current;
      const glory = Math.round(s.kills * 3 * (1 + s.kills * 0.012));
      onEnd({
        result,
        kills: s.kills,
        glory,
        duration_s: Math.max(10, Math.round(s.elapsed)),
      });
    },
    [onEnd]
  );

  const heroUnit = () =>
    stateRef.current.units.find((u) => u.team === 0 && u.hero);

  /* Player commands. Dash: close on the nearest foe and hit hard. */
  const doDash = useCallback(() => {
    const s = stateRef.current;
    const h = heroUnit();
    if (!h || !h.alive || s.dashCd > 0) return;
    const foe = nearestEnemy(s.units, h);
    if (!foe) return;
    s.dashCd = 1.6;
    /* Leap most of the way to the foe, then strike a cluster around them. */
    h.x += (foe.x - h.x) * 0.7;
    h.y += (foe.y - h.y) * 0.7;
    h.lunge = 1;
    s.units.forEach((u) => {
      if (u.team === 1 && u.alive && dist(h, u) < 0.14) {
        damage(s, u, h.atk * 2.4, h.team, h);
        s.slashes.push({ x: u.x, y: u.y, life: 1, team: h.team });
      }
    });
  }, []);

  const doUlt = useCallback(() => {
    const s = stateRef.current;
    const h = heroUnit();
    if (!h || !h.alive || s.ultCd > 0) return;
    s.ultCd = 12;
    h.lunge = 1;

    /* Each champion's ultimate resolves to its own shape — a single-target
       nuke, a wide cleave, a double-striking storm, a heal, a shield, or a
       stun — so the written ultimate finally plays the way it reads. */
    const prof = buildCombatProfile(champion);
    const amt = h.atk * prof.ultDamageMul;
    const inRange = s.units
      .filter((u) => u.team === 1 && u.alive && dist(h, u) < prof.ultRadius)
      .sort((a, b) => dist(h, a) - dist(h, b));

    const strike = (u: Unit) => {
      damage(s, u, amt, h.team, h);
      s.slashes.push({ x: u.x, y: u.y, life: 1, team: h.team });
    };

    if (prof.ultimate === "nuke") {
      if (inRange[0]) strike(inRange[0]);
    } else if (prof.ultimate === "multistrike") {
      for (const u of inRange) {
        strike(u);
        if (u.alive) damage(s, u, amt, h.team, h);
      }
    } else {
      // cleave / heal / shield / stun all sweep everyone in range...
      for (const u of inRange) strike(u);
      applyUltSupport(s.units, h, inRange, prof.ultimate);
    }

    s.floats.push({
      x: h.x,
      y: h.y - 0.06,
      text: prof.ultName,
      life: 1.4,
      color: "#F0D68C",
    });
  }, [champion]);

  const doShield = useCallback(() => {
    const s = stateRef.current;
    const h = heroUnit();
    if (!h || !h.alive || s.shieldCd > 0) return;
    s.shieldCd = 14;
    s.units.forEach((u) => {
      if (u.team === 0 && u.alive && dist(h, u) < 0.2) u.shield = 3.5;
    });
    h.shield = 4;
  }, []);

  /* The battle loop. Runs only while playing. */
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (stateRef.current.units.length === 0) {
      spawnHost();
      /* Open with a first press of foes so the fight starts hot. */
      const s0 = stateRef.current;
      const opening = Math.min(6, s0.budget);
      for (let i = 0; i < opening; i++) releaseFoe(i);
    }

    let raf = 0;
    let last = performance.now();
    const s = stateRef.current;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      step(s, dt);

      /* Keep the field pressed: top up to a live target while the army budget
         holds, so there is never a silent gap between kills and the next foe. */
      const foesAlive = s.units.filter((u) => u.team === 1 && u.alive).length;
      const target = 7;
      if (foesAlive < target && s.spawned < s.budget) {
        releaseFoe(s.spawned);
      }

      render(ctx, canvas, s, field);

      s.elapsed += dt;
      s.ultCd = Math.max(0, s.ultCd - dt);
      s.shieldCd = Math.max(0, s.shieldCd - dt);
      s.dashCd = Math.max(0, s.dashCd - dt);

      const h = s.units.find((u) => u.team === 0 && u.hero);
      const foesLeftAlive = s.units.some((u) => u.team === 1 && u.alive);
      const remaining = Math.max(0, s.budget - s.kills);

      /* Push HUD ~10x a second, not every frame. */
      if (now - s.lastHudPush > 100) {
        s.lastHudPush = now;
        setHud({
          heroHp: h ? Math.max(0, h.hp / h.maxHp) : 0,
          time: Math.round(s.elapsed),
          kills: s.kills,
          remaining,
          streak: s.streak,
          glory: Math.round(s.kills * 3 * (1 + s.kills * 0.012)),
          ultReady: s.ultCd,
          shieldReady: s.shieldCd,
          dashReady: s.dashCd,
        });
      }

      if (!ended.current) {
        if (!h || h.hp <= 0) {
          finish("defeat");
          return;
        }
        /* Victory: the whole army is spent and the field is clear. */
        if (s.spawned >= s.budget && !foesLeftAlive) {
          finish("victory");
          return;
        }
        if (s.elapsed >= MAX_SECONDS) {
          finish(remaining <= s.budget * 0.25 ? "victory" : "defeat");
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [phase, spawnHost, releaseFoe, finish, field]);

  const progress = 1 - hud.remaining / totalFoes;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-obsidian">
      {phase === "howto" ? (
        <HowToPlay
          champion={champion}
          totalFoes={totalFoes}
          onBegin={() => setPhase("playing")}
          onExit={() => history.back()}
        />
      ) : (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {!landscape && isTouch() && <RotateHint />}

          {/* Top HUD: hero, army progress, kills, glory, time, retreat. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <div className="flex items-center gap-2.5">
              <div className="glass glass-sm pointer-events-auto flex min-w-0 flex-1 items-center gap-2 p-2">
                {champion.art && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={champion.art}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full border border-gold/40 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-bone">
                    {champion.name}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-void">
                    <div
                      className="h-full rounded-full transition-[width] duration-150"
                      style={{
                        width: `${hud.heroHp * 100}%`,
                        background:
                          hud.heroHp > 0.3
                            ? "linear-gradient(90deg,#C8A24C,#F0D68C)"
                            : "#E5702A",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="glass glass-sm pointer-events-auto px-3 py-1.5 text-center">
                <p className="tnum text-sm font-bold text-gold-bright">
                  {hud.glory}
                </p>
                <p className="text-[9px] uppercase tracking-wider text-bone-faint">
                  Glory
                </p>
              </div>
              <button
                onClick={() => history.back()}
                className="glass glass-sm pointer-events-auto flex h-9 w-9 items-center justify-center text-bone-mut"
                aria-label="Retreat"
              >
                <Icon name="arrow" className="h-4 w-4 rotate-180" />
              </button>
            </div>

            {/* Army-cleared bar: the legible goal. */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-bone-faint">
                Enemy host
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-void/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-ember to-gold-bright transition-[width] duration-200"
                  style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
                />
              </div>
              <span className="tnum text-[11px] font-semibold text-bone">
                {hud.kills}/{totalFoes}
              </span>
            </div>
          </div>

          {/* Controls: Shield (left), Ultimate + Dash (right). */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <ControlButton
              onClick={doShield}
              cooldown={hud.shieldReady}
              icon="shield"
              label="Shield"
              size="md"
              tone="steel"
            />
            <div className="flex items-end gap-3">
              <ControlButton
                onClick={doUlt}
                cooldown={hud.ultReady}
                icon="flame"
                label={champion.ultimate.name}
                size="md"
                tone="ember"
              />
              <ControlButton
                onClick={doDash}
                cooldown={hud.dashReady}
                icon="swords"
                label="Dash"
                size="lg"
                tone="gold"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- control button ---------- */

function ControlButton({
  onClick,
  cooldown,
  icon,
  label,
  size,
  tone,
}: {
  onClick: () => void;
  cooldown: number;
  icon: string;
  label: string;
  size: "md" | "lg";
  tone: "gold" | "ember" | "steel";
}) {
  const dim = size === "lg" ? "h-20 w-20" : "h-14 w-14";
  const iconDim = size === "lg" ? "h-9 w-9" : "h-6 w-6";
  const tones: Record<string, string> = {
    gold: "gold-metal border border-gold-bright/60 text-obsidian",
    ember: "border border-ember/60 bg-ember/20 text-ember",
    steel: "glass glass-sm text-bone",
  };
  return (
    <button
      onClick={onClick}
      disabled={cooldown > 0}
      aria-label={label}
      className={`flex ${dim} items-center justify-center rounded-full ${tones[tone]} transition active:scale-95 disabled:opacity-40`}
    >
      {cooldown > 0 ? (
        <span className="tnum text-sm font-bold">{Math.ceil(cooldown)}</span>
      ) : (
        <Icon name={icon} className={iconDim} />
      )}
    </button>
  );
}

/* ---------- pure helpers ---------- */

function artSlug(art: string) {
  return art.split("/").pop()?.replace(/\.\w+$/, "") ?? art;
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 0.6;
  return Math.hypot(dx, dy);
}
function nearestEnemy(units: Unit[], u: Unit): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const o of units) {
    if (!o.alive || o.team === u.team) continue;
    const d = dist(u, o);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}
/* One blow, run through the attacker's kit and the target's defenses. The
   attacker is optional so effects (burn ticks, thorns) that have no wielder
   still resolve. Called only from the animation loop, never during render, so
   the randomness in crits is safe. */
function damage(
  s: { units: Unit[]; floats: Float[]; kills: number; streak: number },
  target: Unit,
  amount: number,
  byTeam: 0 | 1,
  attacker?: Unit
) {
  if (!target.alive) return;

  let amt = amount;
  let crit = false;
  if (attacker) {
    // Crit: a sharp spike of damage on a chance roll.
    if (attacker.critChance > 0 && Math.random() < attacker.critChance) {
      amt *= attacker.critMul;
      crit = true;
    }
    // Execute: extra bite against a badly wounded foe.
    if (attacker.executeBonus > 0 && target.hp < target.maxHp * 0.4) {
      amt *= 1 + attacker.executeBonus;
    }
  }

  // Target defenses: champion damage reduction, then any active shield.
  let dealt = amt * (1 - (target.dr ?? 0));
  if (target.shield > 0) dealt *= 0.25;
  target.hp -= dealt;
  target.hitFlash = 1;

  s.floats.push({
    x: target.x,
    y: target.y - 0.03,
    text: crit ? `-${Math.round(dealt)}!` : `-${Math.round(dealt)}`,
    life: crit ? 1 : 0.8,
    color: crit ? "#FFE9A8" : byTeam === 0 ? "#F0D68C" : "#E5702A",
  });

  if (attacker) {
    // Lifesteal: the attacker drinks a share of the damage.
    if (attacker.lifesteal > 0 && attacker.alive) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + dealt * attacker.lifesteal);
    }
    // Ignite: lay a burn that ticks over the next moments.
    if (attacker.ignite > 0) {
      target.burn = Math.max(target.burn, 1.6);
      target.burnDps = Math.max(target.burnDps, attacker.atk * attacker.ignite);
    }
    // Thorns: the target answers a share of the blow back at the attacker.
    if (target.thorns > 0 && attacker.alive && attacker !== target) {
      attacker.hp -= dealt * target.thorns;
      if (attacker.hp <= 0 && !(attacker.deathless && !attacker.deathlessUsed)) {
        attacker.alive = false;
        if (target.team === 0) {
          s.kills += 1;
          s.streak = Math.min(5, 1 + s.kills * 0.05);
        }
      }
    }
  }

  if (target.hp <= 0) {
    // Deathless: the first lethal blow leaves the hero at a sliver of life.
    if (target.deathless && !target.deathlessUsed) {
      target.deathlessUsed = true;
      target.hp = 1;
      target.shield = Math.max(target.shield, 2);
      s.floats.push({
        x: target.x,
        y: target.y - 0.08,
        text: "Deathless",
        life: 1.4,
        color: "#9AD1FF",
      });
      return;
    }
    target.alive = false;
    if (byTeam === 0) {
      s.kills += 1;
      s.streak = Math.min(5, 1 + s.kills * 0.05);
    }
  }
}

/* The support half of a champion ultimate — heal / shield the host or freeze
   foes. Kept at module scope (like damage/step) so it can mutate live units
   freely; the in-component callbacks stay pure for the React Compiler. */
function applyUltSupport(
  units: Unit[],
  h: Unit,
  inRange: Unit[],
  kind: "cleave" | "multistrike" | "nuke" | "heal" | "shield" | "stun"
) {
  if (kind === "heal") {
    for (const a of units)
      if (a.team === 0 && a.alive && dist(h, a) < 0.3)
        a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.3);
  } else if (kind === "shield") {
    for (const a of units)
      if (a.team === 0 && a.alive && dist(h, a) < 0.3) a.shield = 4;
  } else if (kind === "stun") {
    for (const u of inRange) u.stun = Math.max(u.stun, 1.6);
  }
}

function step(
  s: {
    units: Unit[];
    floats: Float[];
    slashes: Slash[];
    kills: number;
    streak: number;
  },
  dt: number
) {
  for (const u of s.units) {
    if (!u.alive) continue;
    u.hitFlash = Math.max(0, u.hitFlash - dt * 3);
    u.lunge = Math.max(0, u.lunge - dt * 3);
    u.shield = Math.max(0, u.shield - dt);
    u.cooldown = Math.max(0, u.cooldown - dt);

    /* Burn (ignite passive): ticking damage over its remaining life. Only foes
       are ever set alight, so a burn kill banks for your host. */
    if (u.burn > 0) {
      u.burn -= dt;
      u.hp -= u.burnDps * dt;
      if (u.hp <= 0 && u.alive) {
        u.alive = false;
        if (u.team === 1) {
          s.kills += 1;
          s.streak = Math.min(5, 1 + s.kills * 0.05);
        }
        continue;
      }
    }

    /* Stunned (enemy ultimate effect): the unit is frozen and cannot act. */
    if (u.stun > 0) {
      u.stun -= dt;
      continue;
    }

    const foe = nearestEnemy(s.units, u);
    if (!foe) continue;
    const d = dist(u, foe);
    if (d > u.range) {
      /* March toward the foe. Everyone fights on their own, hero included, so
         the field never idles waiting on a tap. */
      const dx = foe.x - u.x;
      const dy = foe.y - u.y;
      const m = Math.hypot(dx, dy) || 1;
      u.x += (dx / m) * u.speed * dt;
      u.y += (dy / m) * u.speed * dt;
      u.x = Math.max(0.04, Math.min(0.96, u.x));
      u.y = Math.max(0.22, Math.min(0.88, u.y));
    } else if (u.cooldown <= 0) {
      u.cooldown = u.attackInterval;
      u.lunge = 1;
      damage(s, foe, u.atk, u.team, u);
      if (u.hero)
        s.slashes.push({ x: foe.x, y: foe.y, life: 1, team: u.team });
    }
  }

  /* Cull the fallen after a beat so their fade can play, and decay effects. */
  for (const f of s.floats) f.life -= dt;
  for (const sl of s.slashes) sl.life -= dt * 2.5;
  s.floats = s.floats.filter((f) => f.life > 0);
  s.slashes = s.slashes.filter((sl) => sl.life > 0);
  s.units = s.units.filter((u) => u.alive || u.hitFlash > 0.01 || u.hero);
}

const FIELD_TINT: Record<string, string> = {
  "river-crossing": "#0d1420",
  "castle-siege": "#1a1108",
  "snow-valley": "#141821",
  "dark-fortress": "#120b12",
};

function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: { units: Unit[]; floats: Float[]; slashes: Slash[] },
  field: string
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  /* Ground and sky. */
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, FIELD_TINT[field] ?? "#0d1018");
  sky.addColorStop(1, "#050507");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(200,162,76,0.06)";
  ctx.fillRect(0, H * 0.62, W, H * 0.38);

  /* Draw back to front by y. */
  const ordered = [...s.units].sort((a, b) => a.y - b.y);
  for (const u of ordered) {
    const px = u.x * W + u.lunge * (u.team === 0 ? 1 : -1) * 0.02 * W;
    const py = u.y * H;
    const r = u.size * H;
    const ring = u.team === 0 ? "#C8A24C" : "#E5702A";

    /* Shadow */
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(px, py + r * 0.9, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    const alpha = u.alive ? 1 : Math.max(0, u.hitFlash);
    ctx.globalAlpha = alpha;

    /* Hero aura so the player always finds themselves at a glance. */
    if (u.hero && u.team === 0 && u.alive) {
      const glow = ctx.createRadialGradient(px, py, r * 0.2, px, py, r * 1.7);
      glow.addColorStop(0, "rgba(240,214,140,0.35)");
      glow.addColorStop(1, "rgba(240,214,140,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Portrait clipped to a circle. */
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (u.img && u.img.complete && u.img.naturalWidth > 0) {
      const iw = u.img.naturalWidth;
      const ih = u.img.naturalHeight;
      const scale = Math.max((r * 2) / iw, (r * 2) / ih);
      ctx.drawImage(
        u.img,
        px - (iw * scale) / 2,
        py - (ih * scale) / 2 - r * 0.15,
        iw * scale,
        ih * scale
      );
    } else {
      ctx.fillStyle = u.team === 0 ? "#26210f" : "#2a130a";
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    ctx.restore();

    /* Ring, hit flash, shield. */
    ctx.lineWidth = u.hero ? 3 : 2;
    ctx.strokeStyle = ring;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    if (u.shield > 0) {
      ctx.strokeStyle = "rgba(240,214,140,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (u.hitFlash > 0.02 && u.alive) {
      ctx.fillStyle = `rgba(255,255,255,${u.hitFlash * 0.5})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Health bar */
    if (u.alive) {
      const bw = r * 1.8;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(px - bw / 2, py - r - 8, bw, 4);
      ctx.fillStyle = ring;
      ctx.fillRect(px - bw / 2, py - r - 8, bw * Math.max(0, u.hp / u.maxHp), 4);
    }
    ctx.globalAlpha = 1;
  }

  /* Slashes */
  for (const sl of s.slashes) {
    ctx.globalAlpha = sl.life;
    ctx.strokeStyle = sl.team === 0 ? "#F0D68C" : "#E5702A";
    ctx.lineWidth = 3;
    const x = sl.x * W;
    const y = sl.y * H;
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 14);
    ctx.lineTo(x + 14, y + 14);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* Damage numbers */
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.round(H * 0.03)}px ui-sans-serif, system-ui`;
  for (const f of s.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x * W, f.y * H - (1 - f.life) * 20);
    ctx.globalAlpha = 1;
  }
}

/* ---------- overlays ---------- */

function HowToPlay({
  champion,
  totalFoes,
  onBegin,
  onExit,
}: {
  champion: Champion;
  totalFoes: number;
  onBegin: () => void;
  onExit: () => void;
}) {
  const prof = buildCombatProfile(champion);
  const battleKit = {
    tag: playstyleTag(prof),
    passive: passiveEffectText(prof.passive),
    ultimate: ultimateEffectText(prof.ultimate),
  };
  return (
    <div className="realm-bg flex h-full flex-col items-center justify-center overflow-y-auto p-6 text-center">
      <p className="text-[11px] uppercase tracking-[0.3em] text-gold">
        The War
      </p>
      <h2 className="gold-text mt-2 font-display text-3xl font-semibold">
        Break the enemy host
      </h2>
      <p className="mt-2 max-w-sm text-sm text-bone-mut">
        {champion.name} fights on their own. Your taps are for power. Clear all{" "}
        {totalFoes} foes to win.
      </p>

      {/* The champion's real kit — passive and ultimate that actually shape how
          they play, not flavor text. */}
      <div className="glass glass-warm mt-5 w-full max-w-md p-5 text-left">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-base font-semibold text-bone">
            {champion.name}
          </p>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
            {battleKit.tag}
          </span>
        </div>
        <div className="mt-3 flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-void text-gold">
            <Icon name="orb" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-bone">
              Passive · {champion.passive.name}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-bone-mut">
              {battleKit.passive}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-void text-gold">
            <Icon name="flame" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-bone">
              Ultimate · {champion.ultimate.name}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-bone-mut">
              {battleKit.ultimate}
            </p>
          </div>
        </div>
      </div>

      <div className="glass mt-3 w-full max-w-md p-5 text-left text-sm text-bone-mut">
        <Rule icon="swords" title="Dash">
          Leap onto the nearest foe and cut down everything around them. Your
          strongest move, on a short cooldown.
        </Rule>
        <Rule icon="flame" title={`Ultimate: ${champion.ultimate.name}`}>
          {battleKit.ultimate} Save it for the thickest press.
        </Rule>
        <Rule icon="shield" title="Shield">
          Guard yourself and nearby allies for a few seconds. Time it against
          the enemy charge.
        </Rule>
        <Rule icon="medal" title="Glory and $RSP">
          Every foe felled adds Glory. Break the whole host to claim victory.
          Glory converts to $RSP at the season rate (about {GLORY_PER_RSP} Glory
          per $RSP, illustrative for the season).
        </Rule>
      </div>
      <p className="mt-3 text-xs text-bone-faint">
        On a phone, turn it sideways for the full field.
      </p>
      <div className="mt-5 flex gap-3">
        <button
          onClick={onExit}
          className="btn-glass px-6 py-2.5 text-sm text-bone-mut"
        >
          Not yet
        </button>
        <button onClick={onBegin} className="btn-gold px-8 py-2.5 text-sm">
          Sound the horns
        </button>
      </div>
    </div>
  );
}

function Rule({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex gap-3 last:mb-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-void text-gold">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-bone">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-bone-mut">
          {children}
        </p>
      </div>
    </div>
  );
}

function RotateHint() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-obsidian/80 px-4 py-2 text-center backdrop-blur-sm">
      <p className="flex items-center gap-2 text-xs text-gold">
        <Icon name="compass" className="h-4 w-4" />
        Turn sideways for the full field
      </p>
    </div>
  );
}

/* ---------- tiny utils ---------- */
function isTouch() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}
