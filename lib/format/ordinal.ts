/* Written out rather than suffixed. A naive `${rank}th` renders rank three as
   "3th", and a podium or a crest's own earned-context is exactly the range
   where that is visible. Shared so the season close and a crest's trigger
   text cannot drift into two different spellings of the same rank. */
export function ordinal(rank: number): string {
  if (rank === 1) return "first";
  if (rank === 2) return "second";
  if (rank === 3) return "third";
  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}
