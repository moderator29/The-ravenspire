import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/* Shared, cross-instance rate limiter (AUDIT "Auth + security" #6/#16/#3).

   The old /api/raven limiter used a module-level Map: per-lambda, wiped on cold
   start, never pruned, so it did not actually limit under serverless. This uses
   a Supabase-backed fixed-window counter incremented atomically in a single
   upsert (public.rate_limit_hit), so the limit holds across instances and
   concurrent requests cannot race past it.

   Usage from a server route (routes are owned by other agents; wire in there):

     import { rateLimit } from "@/lib/rate-limit";
     const rl = await rateLimit(`raven:${profile.id}`, 20, 3600);
     if (!rl.ok) return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

   Keying: prefer a per-profile key (`action:profileId`) so the limit follows
   the account, not the IP. Use the profileKey helper for consistency. */

export type RateLimitResult = {
  ok: boolean;
  /* Requests used in the current window (post-increment). */
  count: number;
  limit: number;
  remaining: number;
  /* Suggested Retry-After in seconds when ok is false. */
  retryAfter: number;
};

/* Build a stable key namespaced by action, e.g. profileKey("raven", id). */
export function profileKey(action: string, profileId: string): string {
  return `${action}:${profileId}`;
}

/* Best-effort caller address. x-forwarded-for is client-settable in principle,
   so this is only ever a fallback for routes that genuinely serve people who
   are not signed in. Anything behind a profile keys on profileKey instead. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

/* Key a genuinely public route on the caller's address. */
export function ipKey(action: string, req: Request): string {
  return `${action}:ip:${clientIp(req)}`;
}

/* The right key for a route that serves both members and visitors: the
   account when we know it, the address only when we do not. */
export function callerKey(
  action: string,
  req: Request,
  profileId: string | null | undefined
): string {
  return profileId ? profileKey(action, profileId) : ipKey(action, req);
}

/* Record one hit against `key` and report whether it is within `limit` per
   `windowSeconds`. Fails open (allows the request) when Supabase is not
   configured or the store is unreachable, so a limiter outage never takes the
   platform down; the audit's concern is abuse, not availability. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const allow = (count: number): RateLimitResult => ({
    ok: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: count <= limit ? 0 : windowSeconds,
  });

  const db = adminClient();
  if (!db) return allow(0); // unconfigured: fail open

  try {
    const { data, error } = await db.rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
    });
    if (error) return allow(0); // store error: fail open
    const count = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(count)) return allow(0);
    return allow(count);
  } catch {
    return allow(0); // unreachable: fail open
  }
}
