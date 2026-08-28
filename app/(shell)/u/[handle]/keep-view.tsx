"use client";

import { useEffect, useState } from "react";
import { ProfileView } from "@/components/social/profile-view";
import { fetchProfile } from "@/lib/social/queries";
import type { PublicProfile } from "@/lib/social/types";
import {
  DossierMissing,
  DossierSkeleton,
} from "@/components/dossier/dossier-shell";

/* Another member's Keep. The Dossier itself lives in ProfileView, which the
   member's own Keep renders too; this view resolves the handle and answers
   honestly when nobody holds it.

   The client half of the route. The page above it is a server component so the
   Keep can carry its own title into a preview. */

export function KeepView({ handle }: { handle: string }) {
  const [profile, setProfile] = useState<PublicProfile | null | "loading">(
    "loading"
  );

  useEffect(() => {
    void fetchProfile(handle).then(setProfile);
  }, [handle]);

  if (profile === "loading") return <DossierSkeleton />;

  if (!profile)
    return (
      <DossierMissing
        title="No such Keep"
        body="No one by that name holds land in this realm."
        /* The same parent a Keep that does exist falls back to. A name that
           turns out to be wrong should not land the member somewhere else. */
        backHref="/explore"
      />
    );

  return <ProfileView profile={profile} />;
}
