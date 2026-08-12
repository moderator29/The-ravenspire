import { getProfile } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Deployment diagnostics, in two tiers.
 *
 * C6: this route was fully public and returned the Supabase project ref, the
 * live profile count, which env vars are set, and the decoded role/ref/expiry
 * claims of the service-role and anon keys. None of that is a secret on its
 * own, and together it is a map of the deployment handed to anyone who asks.
 *
 * Unauthenticated callers now get liveness only: { ok: true }. That is what an
 * uptime probe or a load balancer actually needs, and it needs no credential.
 * The full diagnostic body is for admins, who are the only people who can act
 * on it. No secret is ever returned in either tier. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  /* Shallow liveness: the process is up and serving. Nothing about the
     deployment leaves here. */
  const profile = await getProfile(req);
  if (!profile?.is_admin) return Response.json({ ok: true });

  const present = (v: string | undefined) => Boolean(v && v.length > 0);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  /* Derive just the project ref (the subdomain) from the URL, not the URL. */
  let supabaseProjectRef: string | null = null;
  try {
    supabaseProjectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : null;
  } catch {
    supabaseProjectRef = null;
  }

  const env = {
    NEXT_PUBLIC_PRIVY_APP_ID: present(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
    PRIVY_APP_SECRET: present(process.env.PRIVY_APP_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: present(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: present(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
    SUPABASE_SERVICE_ROLE_KEY: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY: present(process.env.ANTHROPIC_API_KEY),
  };

  /* Decode a Supabase JWT's claims WITHOUT exposing the key. Only the role,
     project ref and expiry are surfaced; the token itself is never returned.
     This is how we tell a wrong-project or wrong-role key apart at a glance. */
  function keyClaims(raw: string | undefined) {
    if (!raw) return { present: false as const };
    try {
      const payload = raw.split(".")[1];
      const json = JSON.parse(
        Buffer.from(payload, "base64").toString("utf8")
      ) as { role?: string; ref?: string; exp?: number };
      const expired =
        typeof json.exp === "number" ? json.exp * 1000 < Date.now() : null;
      return {
        present: true as const,
        looksLikeJwt: true as const,
        role: json.role ?? null,
        ref: json.ref ?? null,
        expired,
      };
    } catch {
      /* Not a JWT (could be a modern sb_secret_/sb_publishable_ key). */
      return {
        present: true as const,
        looksLikeJwt: false as const,
        prefix: raw.slice(0, 12),
      };
    }
  }

  const keys = {
    serviceRole: keyClaims(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anon: keyClaims(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };

  /* Confirm the service role can actually reach the profiles table, and how
     many rows it sees. A wrong project or bad key surfaces here. */
  let db: {
    ok: boolean;
    profiles: number | null;
    error: string | null;
    code: string | null;
    status: number | null;
  } = { ok: false, profiles: null, error: null, code: null, status: null };
  const admin = adminClient();
  if (!admin) {
    db.error = "admin client not configured";
  } else {
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact" })
      .limit(1);
    db = {
      ok: !error,
      profiles: count ?? null,
      error: error ? error.message || "(empty message)" : null,
      code: error
        ? ((error as { code?: string }).code ?? null)
        : null,
      status: error
        ? ((error as { status?: number }).status ?? null)
        : null,
    };
  }

  const authReady = env.NEXT_PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET;
  const dataReady =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && db.ok;

  return new Response(
    JSON.stringify(
      {
        ok: Boolean(authReady && dataReady),
        authReady: Boolean(authReady),
        dataReady: Boolean(dataReady),
        supabaseProjectRef,
        env,
        keys,
        db,
        note: "keys.serviceRole.role must be 'service_role' and keys.serviceRole.ref must match supabaseProjectRef. If role is 'anon' or ref differs or expired is true, replace SUPABASE_SERVICE_ROLE_KEY on Vercel and redeploy.",
      },
      null,
      2
    ),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
