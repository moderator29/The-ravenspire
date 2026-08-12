/* What the realm is arguing about (V2 section 8, "Trending discussions").
 *
 * The one card on the list that is derived from velocity rather than from a
 * stored event, so the whole question is what "trending" means and how to say
 * it without inventing it.
 *
 * The rules this encodes:
 *
 *   Replies count more than reactions. A like is a reader agreeing and moving
 *   on; a reply is a reader stopping to answer. A discussion is the second
 *   thing, and weighting them equally would surface the most agreeable raven
 *   in the realm rather than the most argued one.
 *
 *   Recent counts more than accumulated. A raven that took four days to gather
 *   twenty replies is not trending, it is popular. Dividing by age turns the
 *   score into a rate, which is what velocity means.
 *
 *   A floor, and it is absolute. Below it there is no card. A realm where the
 *   busiest raven has two replies is a quiet realm, and the honest thing to
 *   show a quiet realm is nothing. This is rule 4 at its sharpest: the pressure
 *   to lower a threshold until something appears is exactly the pressure that
 *   produces invented data.
 *
 * Pure and client safe so the thresholds can be held by tests rather than
 * discovered in production.
 */

export interface TrendingCandidate {
  id: string;
  author_id: string;
  created_at: string;
  reply_count: number;
  like_count: number;
}

export interface TrendingScored extends TrendingCandidate {
  score: number;
  ageHours: number;
}

/* A reply is worth this many reactions. Three because a reply costs a reader
   words and a reaction costs one tap, and because two people arguing should
   outrank ten people nodding. */
export const REPLY_WEIGHT = 3;

/* Below this there is no discussion, whatever the rate says. Two replies in
   ten minutes is a fast conversation between two people, not the realm
   arguing. */
export const MIN_REPLIES = 4;

/* And below this there is not enough total engagement to call it the realm's
   discussion, however the replies are weighted.
   
   Set above MIN_REPLIES * REPLY_WEIGHT on purpose. At exactly that product the
   second floor is a restatement of the first and does no work, which is what
   it was until a test asserted the two were independent and caught it. Fifteen
   means the bare four replies must bring something with them, a fifth reply or
   three reactions, before the realm calls it a discussion. */
export const MIN_WEIGHTED = 15;

/* Ravens older than this are not candidates at any velocity. */
export const WINDOW_HOURS = 48;

/* An hour of grace so a raven posted four minutes ago cannot divide by almost
   zero and win on a single reply. */
const AGE_FLOOR_HOURS = 2;

export function weighted(post: TrendingCandidate): number {
  return (
    Math.max(0, post.reply_count) * REPLY_WEIGHT + Math.max(0, post.like_count)
  );
}

export function scoreOne(
  post: TrendingCandidate,
  now: number
): TrendingScored | null {
  const created = Date.parse(post.created_at);
  if (!Number.isFinite(created)) return null;
  const ageHours = (now - created) / 3.6e6;
  if (ageHours < 0 || ageHours > WINDOW_HOURS) return null;
  return {
    ...post,
    ageHours,
    score: weighted(post) / Math.max(AGE_FLOOR_HOURS, ageHours),
  };
}

/* The realm's discussion right now, or null when there is not one.
 *
 * Returns at most one. A "trending" list of five in a realm this size is a
 * leaderboard of the only five ravens that got replies, and the card is meant
 * to say "this is what the realm is on about", which is singular or nothing. */
export function trendingNow(
  posts: TrendingCandidate[],
  now: number = Date.now()
): TrendingScored | null {
  let best: TrendingScored | null = null;
  for (const post of posts) {
    if (post.reply_count < MIN_REPLIES) continue;
    if (weighted(post) < MIN_WEIGHTED) continue;
    const scored = scoreOne(post, now);
    if (!scored) continue;
    if (!best || scored.score > best.score) best = scored;
  }
  return best;
}
