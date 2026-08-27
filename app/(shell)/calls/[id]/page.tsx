import type { Metadata } from "next";
import { DossierHeader, DossierPage } from "@/components/dossier/dossier-shell";
import { CallDetailView } from "@/components/calls/call-detail";
import { readCallSubject } from "@/lib/share/subjects";

/* The Call detail route: the Dossier (design system section 2).

   Not a Stream, so it does not take the 640px column. Panels go two column at
   lg inside the view, which is what the Dossier archetype asks for, and the
   page itself is a reading width rather than the full display.

   It draws the Dossier frame rather than one of its own, which it did not
   before. The hand rolled frame it carried was `px-4 py-5` at every breakpoint,
   with no compaction and no agreement with the nine other pages that claim this
   archetype: a Dossier that says it is a Dossier and then sets its own gutters
   is a Dossier in the comment only.

   The frame is a server component now, purely so the route can carry metadata.
   A resolved Call is the one thing the realm most wants shared, and until this
   existed every shared Call unfurled under the site-wide title. The reader is
   lib/share/subjects.ts, the same privacy boundary the share card uses: a
   restricted or deleted Call gets the generic title and nothing of its own. */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const call = await readCallSubject(id);
  if (!call) return { title: "A Call of the realm" };

  const verdict =
    call.verdict === "hit"
      ? "It hit."
      : call.verdict === "miss"
        ? "It missed."
        : call.verdict === "void"
          ? "The realm voided it."
          : "Still open, and still on the record.";

  return {
    title: `${call.token} ${call.stance}, called by ${call.callerName}`,
    description: `A Call sealed before the fact and scored by the realm. ${verdict}`,
  };
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DossierPage width="wide">
      <DossierHeader backHref="/calls" backLabel="Back to Calls" />
      <CallDetailView id={id} />
    </DossierPage>
  );
}
