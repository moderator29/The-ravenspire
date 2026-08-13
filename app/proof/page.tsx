import type { Metadata } from "next";
import { ProofSurface } from "@/components/collectibles/proof-surface";

/* The verifier with no opening loaded: pick one, or type three inputs by hand.
   The surface itself, and the reasoning behind every choice on it, lives in
   components/collectibles/proof-surface.tsx, which /proof/[reference] renders
   too. */

export const metadata: Metadata = {
  title: "Check a chest draw",
  description:
    "Rerun any Warchest opening in your own browser. The seed is committed before the chest is opened and revealed when it is, so anybody can check the draw without trusting the realm.",
};

export default function ProofPage() {
  return <ProofSurface />;
}
