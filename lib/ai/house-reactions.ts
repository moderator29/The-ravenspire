/* The Herald's first proactive reaction (platform sweep item 19): a real,
   short reply to a real, rare event off the same spine everything else in
   the realm reads, rather than something a member had to ask for.

   house.overtake is the one it reacts to. It is realm wide, it is written by
   the same recompute pass that already resolves the standings once a day
   (lib/houses/scoring.ts, recomputeSeason), and it is capped at three a pass
   there, so "rare" is not a hope, it is a fact about the code that emits it.

   This module is the pure half, the same split lib/ai/chronicle.ts and
   lib/ai/followups.ts already use: the reduction from a real overtake and the
   real standings either side of it into the lines the Herald is handed, kept
   dependency free so it can be tested without a database, a key, or a network
   call. The impure half, the rate limit and the actual Anthropic call, stays
   in recomputeSeason beside the emit() it is reacting to. */

export interface OvertakeReactionInput {
  houseName: string;
  passedName: string;
  /* The House's new rank in the realm, 1 based. */
  rank: number;
  /* Both scores as the standings hold them right now: real, live, size
     neutral top-20 sums, never a figure the model is left to estimate. */
  houseScore: number;
  passedScore: number;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

/* Shared with the card's own labelling would be nicer than a second copy, but
   components/stream/cards/house-overtake.tsx is a client component and this
   module has to stay importable from server-only code with no bundler
   boundary between them, so the six words are kept here too rather than
   reached for across that line. */
export function ordinal(rank: number): string {
  return ORDINALS[rank - 1] ?? `${rank}th`;
}

/* The fact sheet, in the order that matters: what happened, then where it
   left the House, then the numbers behind it. Every line is a real figure
   already computed by the standings; the model is never asked for one. */
export function overtakeReactionFacts(input: OvertakeReactionInput): string[] {
  return [
    `${input.houseName} just passed ${input.passedName} in the realm's live standings.`,
    `${input.houseName} now stands ${ordinal(input.rank)} in the realm.`,
    `Score right now: ${input.houseName} ${input.houseScore}, ${input.passedName} ${input.passedScore}.`,
  ];
}
