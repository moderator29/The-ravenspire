"use client";

import { use } from "react";
import { BackButton } from "@/components/shell/back-button";
import { CallerProfile } from "@/components/calls/caller-profile";

/* The prediction profile route. Dossier, like the Call detail: hero band, then
   tabs, then panels, with the panels going two column at lg. */

export default function CallerPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = use(params);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5">
      <div className="mb-4">
        <BackButton href="/calls?view=leaderboard" label="Back to the board" />
      </div>
      <CallerProfile handle={handle} />
    </div>
  );
}
