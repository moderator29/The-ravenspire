/* THE DAILY ALLOWANCES.
 *
 * The two ceilings the realm's economy is built on, in a leaf module of their
 * own so that anything may read them without dragging the award machinery in
 * behind them.
 *
 * WHY THEY MOVED OUT OF lib/points.ts
 * A real circular import, found by the build and not by typecheck, which is
 * exactly the class of defect worth recording. lib/realm/appointments.ts
 * asserts its reward ceiling against the social allowance AT MODULE LOAD, so
 * it has to read a fully initialised value. Its import chain was:
 *
 *   points -> crests -> appointments -> points
 *
 * points imports crests for the grant check, crests imports appointments for
 * the vigil threshold, and appointments imported points for this number. The
 * cycle had existed harmlessly for as long as points and crests have referred
 * to each other, because every use was inside a function and by the time any
 * of them ran everything was loaded. A module load assertion is the one thing
 * that cannot wait, so it read the binding before the module holding it had
 * been evaluated and the whole build failed with "cannot access before
 * initialization" from a route that touches none of this.
 *
 * A leaf has no imports, so it cannot be in a cycle. lib/points.ts re-exports
 * both names, so every existing call site is untouched and there is still only
 * one place either number is written down.
 */

/* The daily ceiling on Renown drawn from social actions (V2 section 9.5, rule
   4). Likes, reravens, comments, duel votes, authoring ravens and answering
   the Muster are all unbounded actions that any two accounts can perform on
   each other forever, so without a ceiling a pair of colluding accounts farms
   Renown indefinitely and the ladder means nothing. Resolved Calls are
   deliberately NOT capped: a Call costs a scarce open-Call slot, is scored
   against a difficulty baseline, and is the one thing the realm actually wants
   people doing more of.

   Set where a genuinely active member never notices it and a farm hits it
   inside an hour. */
export const DAILY_SOCIAL_RENOWN_CAP = 200;

/* The daily ceiling on Glory drawn from the War, and the larger of the two
   holes, because it does not even need a second account.

   A settled battle pays up to 400 Glory and the route allows twelve settled
   battles an hour: 4,800 an hour, roughly 115,000 a day, from one member
   leaving a client running. Glory is not a private score. It is added to the
   member's House, and it decides the Clash, the Throne and the Season reward
   vault, so all three were settleable by whoever had the most patience.

   1,500 a day. Ten decisive victories is a long evening in the War and lands
   under it; a grind crosses it in about ninety minutes and earns nothing
   beyond. The War stays worth playing and stops being worth farming. */
export const DAILY_WAR_GLORY_CAP = 1500;
