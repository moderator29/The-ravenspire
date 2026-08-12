/* Period keys for the derived feed producers.
 *
 * A card that describes a period needs a stable name for that period, because
 * the name is what makes the write idempotent: the producer runs daily, the
 * card appears weekly, and the unique index on (kind, subject_id) is what turns
 * seven invocations into one row.
 *
 * ISO weeks rather than "seven days ago", so the boundary is the same for every
 * reader and every run, and so a job that fires late still writes the week it
 * meant to. ISO weeks are also the one date calculation nobody gets right from
 * memory, which is why this is eight lines with its own tests rather than an
 * inline expression in a cron route.
 *
 * Client safe and pure: no database, no server-only import, so the tests can
 * hold it directly.
 */

/* The UTC day, as YYYY-MM-DD. The realm keeps one clock, so a member's
   timezone never changes which day a card belongs to. */
export function realmDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/* The ISO-8601 week, as YYYY-Www.
 *
 * ISO rules, and each one is a trap:
 *   - a week runs Monday to Sunday
 *   - week 1 is the week containing the first Thursday of January
 *   - so early January can belong to week 52 or 53 of the previous YEAR, and
 *     late December can belong to week 1 of the NEXT year
 *
 * The Thursday trick handles all three at once: shift the date to the Thursday
 * of its own week, and that Thursday's calendar year is the ISO year by
 * definition, because week 1 is the one owning January's first Thursday. */
export function realmWeek(at: Date = new Date()): string {
  /* Work in UTC only. A local-time Date would move the week boundary by the
     host's offset, which would give a build server and a reader different
     answers for the same instant. */
  const d = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  );

  /* getUTCDay is 0 for Sunday; ISO numbers Monday 1 through Sunday 7. */
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();

  /* Move to this week's Thursday. */
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);
  const isoYear = d.getUTCFullYear();

  /* Whole weeks from the first day of that ISO year to this Thursday. */
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.floor((d.getTime() - jan1) / 604800000) + 1;

  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
