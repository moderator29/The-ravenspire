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

export interface RateLimitOptions {
  /* Refuse the request when the store cannot be consulted, instead of the
     default fail-open. Opt in only where each allowed request spends real
     money (the paid Anthropic surfaces): there, a limiter outage that waves
     everything through converts an availability bug into an unbounded bill,
     and refusing until the store answers is the cheaper failure. Everywhere
     else the default stands, because a limiter outage must never take free
     surfaces down. */
  failClosed?: boolean;
}

/* Record one hit against `key` and report whether it is within `limit` per
   `windowSeconds`. Fails open (allows the request) when Supabase is not
   configured or the store is unreachable, so a limiter outage never takes the
   platform down; the audit's concern is abuse, not availability. Callers whose
   requests cost real coin pass { failClosed: true } to invert that trade. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opts: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const allow = (count: number): RateLimitResult => ({
    ok: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: count <= limit ? 0 : windowSeconds,
  });

  /* The store could not answer. Fail open by default, closed on request; a
     closed failure suggests a short retry rather than the full window.

     D3: AND IT SAYS SO IN THE LOG. A fail-open limiter that goes quiet is
     indistinguishable from a limiter that is working: every request is
     allowed, nothing is refused, and a rate_limit_hit RPC that was never
     migrated or has stopped answering looks exactly like a realm nobody is
     abusing. One line per failed call, with the reason and the key, so the
     outage is visible in logs instead of being inferred from a bill. */
  const unavailable = (why: string, err?: unknown): RateLimitResult => {
    console.error("rate-limit: store unavailable", {
      why,
      key,
      failClosed: opts.failClosed === true,
      ...(err === undefined ? {} : { err }),
    });
    return opts.failClosed
      ? { ok: false, count: limit, limit, remaining: 0, retryAfter: 60 }
      : allow(0);
  };

  const db = adminClient();
  if (!db) return unavailable("supabase not configured");

  try {
    const { data, error } = await db.rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: windowSeconds,
    });
    if (error) return unavailable("rate_limit_hit rpc error", error);
    const count = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(count))
      return unavailable("rate_limit_hit returned a non-number", data);
    return allow(count);
  } catch (err) {
    return unavailable("rate_limit_hit unreachable", err);
  }
}
