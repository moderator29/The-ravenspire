import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProofSurface } from "@/components/collectibles/proof-surface";
import { isDrawReference } from "@/lib/collectibles/verify";
import { readProofSubject } from "@/lib/share/subjects";

/* ONE SETTLED OPENING, AT ITS OWN ADDRESS.
 *
 * `/proof?draw=<uuid>` already existed and works. This exists because a query
 * string cannot carry an Open Graph card: metadata in this version of Next is
 * resolved per route segment, so a shared proof link could unfurl as the
 * verifier in general but never as the draw somebody was pointing at. A chest
 * opening is the single most shareable thing the collectibles realm produces,
 * because it is the one claim a stranger can check without an account, so it
 * needed a path.
 *
 * NO GATE, for exactly the reason the parent page has no gate: provable
 * fairness that requires an account is not provable fairness. This route is
 * outside app/(shell) and reads only the public proof endpoint.
 *
 * A reference that is not a uuid is a 404 rather than a rendered page with an
 * error in it. The shape is checked before anything reaches Postgres, where a
 * malformed uuid raises 22P02 and a raw database error rendered at a member is
 * both useless to them and a small description of the query to everybody else.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reference: string }>;
}): Promise<Metadata> {
  const { reference } = await params;
  if (!isDrawReference(reference)) return { title: "Check a chest draw" };
  const proof = await readProofSubject(reference);
  /* Titled from the record or not at all. A title naming a chest that has not
     been opened would be the page asserting an opening exists before it has
     checked, which is the one thing a proof surface may never do. */
  if (!proof) return { title: "Check a chest draw" };
  return {
    title: `${proof.chestName}, opened and checkable`,
    description:
      "The seed was committed before this chest was opened and revealed when it was. Rerun the draw in your own browser and check it against the hash.",
  };
}

export default async function ProofReferencePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  if (!isDrawReference(reference)) notFound();
  return <ProofSurface reference={reference} />;
}
