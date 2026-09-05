"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/* The realm had no error boundary anywhere in it.
 *
 * Until this file existed, one thrown error inside the shell took the whole
 * surface down to nothing a member could act on: no message, no way back, and
 * on a phone no obvious difference between the realm breaking and the phone
 * losing the network. A member's only move was to guess that reloading might
 * help. Every other failure in this product degrades honestly and says what
 * happened; the one case where the code itself is at fault said the least.
 *
 * Scoped to the shell rather than the root on purpose. The shell's chrome is
 * gone when this renders (an error boundary replaces the segment it guards),
 * so this offers the two moves that always work: try the surface again, or
 * leave for the Ravenry. Recovery is `unstable_retry` in this version of the
 * framework, not the older `reset`; see the error.js file convention in
 * node_modules/next/dist/docs.
 */
export default function ShellError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <Card pad="lg">
        <EmptyState
          icon="alert"
          title="Something in the realm broke"
          body="This surface failed rather than your connection. Nothing you had earned is affected: the realm settles what matters on the server, not in this page."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="gold" onClick={() => unstable_retry()}>
                Try again
              </Button>
              <Button render={<Link href="/home" />}>The Ravenry</Button>
            </div>
          }
        />
        {/* The digest is the only thing that makes a report actionable, so it
            is shown rather than swallowed. It is an opaque build identifier,
            not member data. */}
        {error.digest ? (
          <p className="mt-4 text-center text-[11px] text-bone-faint">
            Reference {error.digest}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
