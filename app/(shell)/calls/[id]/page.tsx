"use client";

import { use } from "react";
import { BackButton } from "@/components/shell/back-button";
import { CallDetailView } from "@/components/calls/call-detail";

/* The Call detail route: the Dossier (design system section 2).

   Not a Stream, so it does not take the 640px column. Panels go two column at
   lg inside the view, which is what the Dossier archetype asks for, and the
   page itself is a reading width rather than the full display. */

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5">
      <div className="mb-4">
        <BackButton href="/calls" label="Back to Calls" />
      </div>
      <CallDetailView id={id} />
    </div>
  );
}
