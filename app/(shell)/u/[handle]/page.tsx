import type { Metadata } from "next";
import { readKeepSubject } from "@/lib/share/subjects";
import { KeepView } from "./keep-view";

/* A member's Keep, at its public address.
 *
 * A thin server shell so the route carries metadata. Sharing a Keep is how a
 * member introduces themselves to anyone outside the realm, and until this
 * existed every one of those links unfurled with the site-wide title, so the
 * card said The Ravenspire and the text beside it said The Ravenspire too.
 *
 * The reader is lib/share/subjects.ts, which is the privacy boundary the share
 * card already runs behind: standing only, never a balance, and nothing at all
 * for a member the realm has removed. Renown and Glory are on the card because
 * they are on every leaderboard in the realm already. A handle nobody holds
 * falls back to the generic title rather than inventing a member.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const keep = await readKeepSubject(handle);
  if (!keep) return { title: "A Keep of the realm" };

  const standing = [keep.tier, keep.houseName].filter(Boolean).join(" of ");
  return {
    title: `${keep.name}'s Keep`,
    description: standing
      ? `${standing}. ${keep.renown.toLocaleString("en-US")} Renown, ${keep.glory.toLocaleString("en-US")} Glory, earned in the realm.`
      : `${keep.renown.toLocaleString("en-US")} Renown, ${keep.glory.toLocaleString("en-US")} Glory, earned in the realm.`,
  };
}

export default async function PublicKeepPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <KeepView handle={handle} />;
}
