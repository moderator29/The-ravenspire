import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* The caller's banner: their shareable code, how many recruits have JOINED
   under it (counted the moment they take the black), how many have gone on to
   ACTIVATE (the third-raven reward milestone), and the roll of names they sent. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* The referral code is the member's handle; a row is written to
     referral_codes at onboarding. Fall back to the handle so the banner
     always resolves even for older accounts. */
  const { data: codeRow } = await db
    .from("referral_codes")
    .select("code")
    .eq("owner_id", profile.id)
    .maybeSingle();
  const code = codeRow?.code ?? profile.handle ?? null;

  const { data: rows } = await db
    .from("referrals")
    .select(
      "joined, activated, created_at, member:profiles!referrals_profile_id_fkey (handle, display_name, avatar_url, house_slug, tier)"
    )
    .eq("referrer_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const referrals = (rows ?? []).map((r) => ({
    /* A row exists only once a recruit has joined, so treat a missing/false
       `joined` as still counted; the column just makes the count explicit. */
    joined: r.joined !== false,
    activated: Boolean(r.activated),
    created_at: r.created_at as string,
    member: r.member ?? null,
  }));
  const joined = referrals.filter((r) => r.joined).length;
  const activated = referrals.filter((r) => r.activated).length;

  return json({
    code,
    /* joined: counted on sign-up. activated: reached the reward milestone.
       `pending` = joined but not yet activated. `total` kept for older clients. */
    joined,
    activated,
    pending: joined - activated,
    total: referrals.length,
    referrals,
  });
}
