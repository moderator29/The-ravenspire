import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { houses } from "@/lib/data/houses";
import type { SessionProfile } from "@/lib/auth/server";

/* WHO THE HERALD IS TALKING TO.
 *
 * The Herald used to answer every member identically: it knew the market and
 * the lore, and nothing at all about the person asking. A member could ask
 * "how am I doing?" or "what should I focus on?" and get a general essay,
 * because the route handed the model token prices and House descriptions and
 * never once mentioned that this particular member is a Squire of Stormcrest
 * with 179 Renown and no Calls won yet.
 *
 * This module assembles the member's own real record into a short brief the
 * model reads before answering. Every figure is read live from the same
 * tables the Keep and the Coffers read, so the Herald cannot tell a member
 * something their own profile contradicts.
 *
 * PRIVACY. This is the member's OWN dossier, assembled for the member's own
 * conversation and never for anyone else's: the route passes the session
 * profile, so there is no path here to another member's figures. Nothing here
 * is cached across requests for the same reason.
 *
 * HONESTY. Every field is nullable and every read is allowed to fail. A brief
 * that is missing the Calls record says so by omitting it; it never guesses,
 * and it never sends a zero that means "we could not read this". That
 * distinction is the whole reason the counts are assembled here rather than
 * defaulted at the call site. */

export interface MemberContext {
  handle: string | null;
  displayName: string | null;
  houseName: string | null;
  houseMotto: string | null;
  tier: string;
  renown: number;
  glory: number;
  points: number;
  hasWallet: boolean;
  walletAddress: string | null;
  /* Null when the read failed, which is different from zero. */
  callsWon: number | null;
  callsLost: number | null;
  callsOpen: number | null;
  crestCount: number | null;
  isAdmin: boolean;
  onboarded: boolean;
}

export async function loadMemberContext(
  profile: SessionProfile
): Promise<MemberContext> {
  const house = profile.house_slug
    ? houses.find((h) => h.slug === profile.house_slug)
    : undefined;

  const base: MemberContext = {
    handle: profile.handle,
    displayName: profile.display_name,
    houseName: house?.name ?? null,
    houseMotto: house?.motto ?? null,
    tier: profile.tier,
    renown: profile.renown ?? 0,
    glory: profile.glory ?? 0,
    points: profile.points ?? 0,
    hasWallet: Boolean(profile.wallet_address),
    walletAddress: profile.wallet_address,
    callsWon: null,
    callsLost: null,
    callsOpen: null,
    crestCount: null,
    isAdmin: profile.is_admin,
    onboarded: profile.onboarded,
  };

  const db = adminClient();
  if (!db) return base;

  try {
    /* The same two reads the Coffers performs for a member's public record,
       so the Herald and the Keep can never disagree about a Calls tally. */
    const [callsRes, crestsRes] = await Promise.all([
      db
        .from("posts")
        .select("call")
        .eq("author_id", profile.id)
        .eq("kind", "call")
        .eq("deleted", false)
        .limit(1000),
      db
        .from("user_crests")
        .select("crest_slug", { count: "exact", head: true })
        .eq("profile_id", profile.id),
    ]);

    if (!callsRes.error) {
      let won = 0;
      let lost = 0;
      let open = 0;
      for (const row of (callsRes.data ?? []) as {
        call: { verdict?: string } | null;
      }[]) {
        const verdict = row.call?.verdict;
        if (verdict === "hit") won += 1;
        else if (verdict === "miss") lost += 1;
        else open += 1;
      }
      base.callsWon = won;
      base.callsLost = lost;
      base.callsOpen = open;
    }

    if (!crestsRes.error) base.crestCount = crestsRes.count ?? 0;
  } catch {
    /* A dossier that could not be read is a dossier with fewer facts in it,
       never a dossier with invented ones. */
  }

  return base;
}

/* The brief the model reads. Written as plain sentences rather than a JSON
   dump, because the model answers in prose and reads prose context more
   reliably than it reads a serialised object.
 *
 * The closing instruction matters as much as the facts. Without it the model
 * tends to recite the dossier back at the member ("As a Squire of Stormcrest
 * with 179 Renown..."), which reads like a form letter. The brief is for
 * grounding, not for narration. */
export function describeMemberForRaven(m: MemberContext): string {
  const lines: string[] = [];
  const name = m.displayName ?? (m.handle ? `@${m.handle}` : "this member");

  lines.push(
    `You are speaking with ${name}${m.handle ? ` (@${m.handle})` : ""}, a member of the realm.`
  );

  if (m.houseName) {
    lines.push(
      `They are sworn to ${m.houseName}${m.houseMotto ? `, whose words are "${m.houseMotto}"` : ""}.`
    );
  } else {
    lines.push(
      "They have not sworn to a House yet, so they can still choose any of the six."
    );
  }

  lines.push(
    `Standing: ${m.tier}, ${m.renown.toLocaleString()} Renown, ${m.glory.toLocaleString()} Glory, ${m.points.toLocaleString()} POINTS earned.`
  );

  if (m.callsWon !== null && m.callsLost !== null && m.callsOpen !== null) {
    const total = m.callsWon + m.callsLost + m.callsOpen;
    lines.push(
      total === 0
        ? "They have not sealed a Call yet."
        : `Calls: ${m.callsWon} won, ${m.callsLost} lost, ${m.callsOpen} still open.`
    );
  }

  if (m.crestCount !== null) {
    lines.push(
      m.crestCount === 0
        ? "They have earned no Crests yet."
        : `They hold ${m.crestCount} Crest${m.crestCount === 1 ? "" : "s"}.`
    );
  }

  lines.push(
    m.hasWallet
      ? "They have a non-custodial embedded Vault wallet on the platform."
      : "They have no wallet connected yet."
  );

  if (!m.onboarded) {
    lines.push(
      "They have not finished onboarding, so they may still need to claim a handle and swear to a House."
    );
  }

  lines.push(
    "Use this to answer their questions about themselves directly and specifically, and to tailor advice. POINTS are the earned balance and are always spoken of as POINTS, never as $RSP amounts. Do not recite this dossier back at them or open with their titles; just know it, the way a good steward knows the household."
  );

  return lines.join(" ");
}
