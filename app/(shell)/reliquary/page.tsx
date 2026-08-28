import type { Metadata } from "next";
import { getFlag } from "@/lib/flags";
import { ReliquaryView } from "./reliquary-view";

export const metadata: Metadata = {
  title: "The Reliquary",
  description:
    "Set One, the legion of the Six Houses: the realm's cards and relics, drawn from the War's own roster.",
};

/* Flag-dependent: read the chapter flag at request time, so opening day is a
   flag flip and not a deploy, the same posture as the Mercer and the
   Warchests. The page was a pure client component before this, which meant
   reliquary_live existed, was admin-flippable, was documented as "unseals The
   Reliquary", and changed nothing on the one route it names: the launch lever
   was connected to no machinery. The read happens here because lib/flags is
   server-only; the client half receives a boolean and stays a client
   component for its filters. */
export const dynamic = "force-dynamic";

export default async function ReliquaryPage() {
  const live = await getFlag("reliquary_live");
  return <ReliquaryView live={live} />;
}
