"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CrestRoundel } from "@/components/brand/crests";
import { ShareButton } from "@/components/share/share-button";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { useViewerHandle } from "@/lib/social/use-viewer";

/* A member's first-ever crest, the one moment section 21 means by ornament
 * that is actually earned: every other crest still lands as a Ravenry card
 * (components/stream/cards/crest-earned.tsx), public and third person, but
 * the first one is a member's own, and until now nobody who was not looking
 * at the Ravenry at that exact moment ever saw it land at all.
 *
 * Server-authoritative and shown exactly once. GET /api/crests/first-ceremony
 * answers from `profiles.first_crest_slug` (written once, centrally, by
 * lib/points.ts's grantCrest, whichever of several call sites happened to
 * grant the first crest a profile ever held) and `first_crest_celebrated`;
 * dismissing here POSTs the same route to flip that flag, so it never shows
 * twice, on this device or any other.
 *
 * Mounted once, low in the shell (the Ravenry, the member's own front door),
 * not on every route: a member who never opens the app after earning their
 * first crest still gets it the next time they do, since the pending state
 * lives on the server rather than a page visit. */
export function FirstCrestCeremony() {
  const { ready, authenticated } = useRealmAuth();
  const viewerHandle = useViewerHandle();
  const [crest, setCrest] = useState<{
    slug: string;
    name: string;
    icon: string;
  } | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let alive = true;
    void realmFetch<{
      pending?: boolean;
      crest?: { slug: string; name: string; icon: string };
    }>("/api/crests/first-ceremony").then((res) => {
      if (!alive) return;
      if (res.ok && res.data?.pending && res.data.crest) {
        setCrest(res.data.crest);
      }
    });
    return () => {
      alive = false;
    };
  }, [ready, authenticated]);

  const dismiss = () => {
    setCrest(null);
    void realmFetch("/api/crests/first-ceremony", { method: "POST" });
  };

  if (!crest) return null;

  return (
    <AdaptiveDialog
      open
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      size="md"
      title="Your first Crest"
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <CrestRoundel icon={crest.icon} className="h-32 w-32" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold">
            Struck in your name
          </p>
          <p className="gold-text mt-2 font-display text-2xl font-semibold">
            {crest.name}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-bone-mut">
            The first of the realm&apos;s crests to bear your name. It stays
            on your Keep for good, and every one after this earns its own
            place in the Ravenry.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          {viewerHandle ? (
            <ShareButton
              target={{ kind: "crest", handle: viewerHandle, slug: crest.slug }}
              subjectHandle={viewerHandle}
              label="Share this crest"
              variant="gold"
              size="lg"
              className="w-full"
            />
          ) : null}
          {viewerHandle ? (
            <Button
              variant="glass"
              size="lg"
              block
              render={
                <Link
                  href={`/u/${viewerHandle}/crest/${crest.slug}`}
                  onClick={dismiss}
                />
              }
            >
              See it in your Keep
            </Button>
          ) : null}
          <Button variant="ghost" size="md" block onClick={dismiss}>
            Continue
          </Button>
        </div>
      </div>
    </AdaptiveDialog>
  );
}
