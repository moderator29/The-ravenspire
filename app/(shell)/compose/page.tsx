"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Composer } from "@/components/social/composer";
import { Skeleton } from "@/components/ui/skeleton";
import type { CallDirection } from "@/lib/calls/types";

/*
  The dedicated compose screen. Like X's compose, the whole surface is given
  over to writing a single raven: a top bar with a way out and a prominent
  Send raven, the author's avatar, and a large textarea. Every composer feature
  travels with it (images, the Herald's suggestion, audience). On a successful
  send the Composer routes back to /home, where the feed reloads on mount and
  surfaces the new raven.

  ?call=1&token=SYM&stance=up|down opens straight into the Call composer with
  a coin and a stance already chosen, the entry point a just-completed trade
  in the trade panel links to. Both are just a starting point: nothing here
  seals anything the member did not confirm themselves in the form below.
*/
export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-32" />
        </div>
      }
    >
      <ComposePageSurface />
    </Suspense>
  );
}

function ComposePageSurface() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const stanceParam = searchParams.get("stance");
  const stance: CallDirection | undefined =
    stanceParam === "up" || stanceParam === "down" ? stanceParam : undefined;
  const initialCall =
    searchParams.get("call") && token ? { token, stance } : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Composer page initialCall={initialCall} />
    </div>
  );
}
