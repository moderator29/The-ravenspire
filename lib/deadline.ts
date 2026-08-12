/* A deadline for a read that might never answer.

   A promise that never settles is not caught by a `catch`. Every money surface
   in this product already handles a *rejected* read: the Scrying Glass falls to
   "The glass clouded over", the coin page to an error state, the Oracle to a
   message. None of them handled a read that simply never answers, and that is
   not hypothetical. Measured against a socket held open and never closed, with
   the app otherwise healthy:

     /scanner   30s after pressing Scan, the button still read "The Oracle
                reads you..." with a spinner turning. It had no `catch` at all,
                so even a rejection would have left it there.
     /scrying   36 skeleton bars still pulsing at 30s.
     /coin/...  10 skeleton bars still pulsing at 30s.
     /forge     the staking flag read is retried by supabase-js with backoff
                (measured at +714ms, +1.9s, +4.3s, +8.5s), so the pitch card
                held a grey bar for 9.5 seconds before the badge appeared.

   These are trading screens. A skeleton is a claim that a number is arriving,
   and a claim that stays false for as long as the member stays on the page is
   worse on a balance than anywhere else in the realm.

   This rejects rather than resolving a stand-in, so a hang lands in whatever
   `catch` a failure already lands in. One path to the honest empty state, not
   two, and no call site grows a second branch. */

/* Two rungs, because the two kinds of read have honestly different budgets.

   A data read is a database or a market API and is slow at two seconds. A real
   Anthropic call reasoning over a member's whole account is slow at twenty and
   not broken at forty, so giving it the data budget would cut off answers that
   were on their way. House rule 5 says every AI surface is a real model call,
   so the deadline has to be sized for one.

   Both numbers are set where a member has stopped believing rather than where
   the server has stopped trying. Past that point the deadline is the only
   thing that can end the wait, so it may as well end it honestly. */
export const DEADLINE_READ = 12_000;
export const DEADLINE_MODEL = 45_000;

export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`No answer within ${ms}ms`);
    this.name = "DeadlineError";
  }
}

/* `PromiseLike`, not `Promise`, because a supabase-js query builder is a
   thenable rather than a promise and is one of the reads that needs this. */
export function withDeadline<T>(
  work: PromiseLike<T>,
  ms: number = DEADLINE_READ
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
