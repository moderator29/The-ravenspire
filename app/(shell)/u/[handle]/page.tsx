"use client";

import { use, useEffect, useState } from "react";
import { ProfileView } from "@/components/social/profile-view";
import { fetchProfile } from "@/lib/social/queries";
import type { PublicProfile } from "@/lib/social/types";
import {
  DossierMissing,
  DossierSkeleton,
} from "@/components/dossier/dossier-shell";

/* Another member's Keep. The Dossier itself lives in ProfileView, which the
   member's own Keep renders too; this route resolves the handle and answers
   honestly when nobody holds it. */

export default function PublicKeepPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = use(params);
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
      />
    );

  return <ProfileView profile={profile} back />;
}
