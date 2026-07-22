"use client";

import { use, useEffect, useState } from "react";
import { ProfileView } from "@/components/social/profile-view";
import { fetchProfile } from "@/lib/social/queries";
import type { PublicProfile } from "@/lib/social/types";
import { BackButton } from "@/components/shell/back-button";

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

  if (profile === "loading")
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="glass h-48 animate-pulse" />
      </div>
    );
  if (!profile)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-6 flex justify-center">
          <BackButton />
        </div>
        <h1 className="font-display text-xl font-semibold text-bone">
          No such Keep
        </h1>
        <p className="mt-2 text-sm text-bone-mut">
          No one by that name holds land in this realm.
        </p>
      </div>
    );
  return (
    <>
      <div className="mx-auto w-full max-w-2xl px-3 pt-4 sm:px-4">
        <BackButton />
      </div>
      <ProfileView profile={profile} />
    </>
  );
}
