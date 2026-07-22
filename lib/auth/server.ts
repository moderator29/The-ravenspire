import "server-only";
import { PrivyClient } from "@privy-io/server-auth";
import { adminClient } from "@/lib/supabase/admin";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

const privy = appId && appSecret ? new PrivyClient(appId, appSecret) : null;

export type SessionProfile = {
  id: string;
  privy_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  x_handle: string | null;
  wallet_address: string | null;
  renown: number;
  tier: string;
  points: number;
  glory: number;
  is_admin: boolean;
  onboarded: boolean;
  /* Optional: present once the ban/verify columns exist. Read defensively so
     a slightly-later column migration never breaks auth. */
  is_banned?: boolean;
  is_verified?: boolean;
};

/* Columns every profile read needs. is_banned/is_verified are appended
   separately so a missing column can be tolerated (see selectProfile). */
const BASE_COLUMNS =
  "id, privy_id, handle, display_name, avatar_url, house_slug, x_handle, wallet_address, renown, tier, points, glory, is_admin, onboarded";
const FULL_COLUMNS = `${BASE_COLUMNS}, is_banned, is_verified`;

type Db = NonNullable<ReturnType<typeof adminClient>>;

/* Longest display name we persist for the auto-created profile shell. Onboard
   applies its own cap when a user submits one; this bounds the Privy-derived
   fallback so an overlong X name can't flow through uncapped. */
const DISPLAY_NAME_MAX = 40;

function cleanDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, DISPLAY_NAME_MAX);
}

/* Verify the bearer token and return the caller's Privy user id, or null. */
async function verifyPrivyId(req: Request): Promise<string | null> {
  if (!privy) return null;
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    return claims.userId;
  } catch {
    return null;
  }
}

/* Read a single profile by privy id. Tries the full column set first and
   falls back to the base set if the is_banned/is_verified columns are not
   present yet, so authorization keeps working across the column migration. */
async function selectProfile(
  db: Db,
  privyId: string
): Promise<SessionProfile | null> {
  const full = await db
    .from("profiles")
    .select(FULL_COLUMNS)
    .eq("privy_id", privyId)
    .maybeSingle();
  if (!full.error) return (full.data as SessionProfile) ?? null;

  /* Column likely missing (42703) or otherwise unavailable: degrade to base. */
  const base = await db
    .from("profiles")
    .select(BASE_COLUMNS)
    .eq("privy_id", privyId)
    .maybeSingle();
  if (base.error) return null;
  return (base.data as SessionProfile) ?? null;
}

/* True when the profile is banned. Missing column => treated as not banned. */
function isBanned(profile: SessionProfile): boolean {
  return profile.is_banned === true;
}

/* Read-only authorization check: verify the token and return the caller's
   EXISTING profile, or null. Never inserts a profile row and never enriches
   from Privy, so probing endpoints cannot mint profile rows. Banned users
   resolve to null so they cannot act. Use this for authorization/gating. */
export async function getProfile(req: Request): Promise<SessionProfile | null> {
  const db = adminClient();
  if (!db) return null;
  const privyId = await verifyPrivyId(req);
  if (!privyId) return null;
  const profile = await selectProfile(db, privyId);
  if (!profile) return null;
  if (isBanned(profile)) return null;
  return profile;
}

/* Verify the bearer token and return (or, on genuine first entrance, create)
   the caller's profile. Returns null when unauthenticated, unconfigured, or
   banned. Only the true onboarding path (no existing row) creates a profile. */
export async function requireProfile(
  req: Request
): Promise<SessionProfile | null> {
  /* Fast path: existing, non-banned profile. Reuses the read-only check. */
  const existing = await getProfile(req);
  if (existing) return existing;

  /* getProfile returned null. Distinguish the three causes so we only create
     a profile for a genuinely new user, never for a bad token or a banned
     account (a banned account already has a row and must stay blocked). */
  if (!privy) return null;
  const db = adminClient();
  if (!db) return null;
  const privyId = await verifyPrivyId(req);
  if (!privyId) return null;

  const row = await selectProfile(db, privyId);
  if (row) {
    /* Row exists but getProfile rejected it (banned). Do not resurrect. */
    return null;
  }

  /* First entrance: create the profile shell, enrich from Privy. The X
     profile photo becomes the citizen's first avatar (editable later). */
  let displayName: string | null = null;
  let xHandle: string | null = null;
  let wallet: string | null = null;
  let avatar: string | null = null;
  try {
    const user = await privy.getUser(privyId);
    xHandle = user.twitter?.username ?? null;
    displayName = cleanDisplayName(
      user.twitter?.name ??
        user.twitter?.username ??
        user.email?.address?.split("@")[0] ??
        null
    );
    wallet = user.wallet?.address ?? null;
    const pic = user.twitter?.profilePictureUrl ?? null;
    /* Twitter serves a tiny "_normal" crop by default; ask for a real size. */
    avatar = pic ? pic.replace("_normal", "_400x400") : null;
  } catch {
    /* enrichment is best-effort */
  }

  const { data: created, error } = await db
    .from("profiles")
    .insert({
      privy_id: privyId,
      display_name: displayName,
      x_handle: xHandle,
      wallet_address: wallet,
      avatar_url: avatar,
    })
    /* Base columns only: a fresh row is never banned/verified, and this keeps
       creation working even if the is_banned/is_verified migration lands after
       this one. */
    .select(BASE_COLUMNS)
    .single();

  if (!error && created) {
    const profile = created as SessionProfile;
    /* A brand-new row cannot be banned, but stay consistent. */
    if (isBanned(profile)) return null;
    return profile;
  }

  /* Insert failed. The common cause is a concurrent first-touch request for
     the same privy_id winning the race (privy_id is unique). Re-select so both
     requests resolve to the same profile instead of returning a spurious 401. */
  const raced = await selectProfile(db, privyId);
  if (raced && !isBanned(raced)) return raced;
  return null;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
