import { getProfile, json } from "@/lib/auth/server";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { lookupToken } from "@/lib/data/tokens";

/* A single token card, resolved from a symbol or an address through the shared
   lookup (DexScreener, keyless).

   C4: it stays open to visitors, because the Herald and the landing surfaces
   read it before anyone signs in, but an open relay to a third party is a
   quota somebody else can spend. Metered like the rest of the public market
   routes: on the account when the caller is a member, on the address when they
   are not. */
export async function GET(req: Request) {
  const profile = await getProfile(req);
  const rl = await rateLimit(
    callerKey("token", req, profile?.id),
    profile ? 300 : 120,
    3600
  );
  if (!rl.ok)
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);

  const q = new URL(req.url).searchParams.get("q");
  if (!q) return json({ error: "missing q" }, 400);
  const card = await lookupToken(q);
  return json({ card });
}
