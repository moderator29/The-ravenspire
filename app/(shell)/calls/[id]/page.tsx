"use client";

import { use } from "react";
import { DossierHeader, DossierPage } from "@/components/dossier/dossier-shell";
import { CallDetailView } from "@/components/calls/call-detail";

/* The Call detail route: the Dossier (design system section 2).

   Not a Stream, so it does not take the 640px column. Panels go two column at
   lg inside the view, which is what the Dossier archetype asks for, and the
   page itself is a reading width rather than the full display.

   It draws the Dossier frame rather than one of its own, which it did not
   before. The hand rolled frame it carried was `px-4 py-5` at every breakpoint,
   with no compaction and no agreement with the nine other pages that claim this
   archetype: a Dossier that says it is a Dossier and then sets its own gutters
   is a Dossier in the comment only. */

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <DossierPage width="wide">
      <DossierHeader backHref="/calls" backLabel="Back to Calls" />
      <CallDetailView id={id} />
    </DossierPage>
  );
}
