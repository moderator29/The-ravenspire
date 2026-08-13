"use client";

import { use } from "react";
import { DossierHeader, DossierPage } from "@/components/dossier/dossier-shell";
import { CallerProfile } from "@/components/calls/caller-profile";

/* The prediction profile route. Dossier, like the Call detail: hero band, then
   tabs, then panels, with the panels going two column at lg. Same frame as the
   Call detail beside it, from the shell rather than from a copy. */

export default function CallerPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = use(params);
  return (
    <DossierPage width="wide">
      <DossierHeader
        backHref="/calls?view=leaderboard"
        backLabel="Back to the board"
      />
      <CallerProfile handle={handle} />
    </DossierPage>
  );
}
