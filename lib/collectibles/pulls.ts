import "server-only";

/* The chest roll, as the server sees it.
 *
 * WHAT MOVED, AND WHY THIS FILE IS NOW FOUR LINES OF SUBSTANCE.
 *
 * The algorithm lives in `lib/collectibles/roll.ts` now. It used to live here,
 * behind `server-only` and `node:crypto`, and that was correct right up until
 * the realm needed a verifier a sceptic could believe.
 *
 * A verifier that posts the seeds to the realm and renders whatever the realm
 * answers proves nothing about a realm that has decided to lie. The rerun has
 * to happen on the member's own machine, from code they can read, which means
 * the roll has to reach the browser, which `server-only` and `node:crypto`
 * both forbid. See `roll.ts` and `sha256.ts` for the full reasoning, including
 * why there is exactly one implementation of the algorithm rather than a
 * server copy and a browser copy.
 *
 * This file is kept rather than deleted because the opening route and the seed
 * module both import from it, and because the `server-only` marker is still
 * worth something here: `lib/collectibles/seeds.ts` hashes live server seeds,
 * and a live server seed must never be in a client bundle. Importing through
 * this file is how a server module says it is a server module.
 *
 * Anything that runs in a browser imports `roll.ts` directly.
 */

export { rollChest, seedHash } from "@/lib/collectibles/roll";
export type { PulledCard, ChestRoll } from "@/lib/collectibles/roll";
