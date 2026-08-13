"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { RavenMark } from "@/components/brand/raven-mark";
import { isPublicSharePath } from "@/lib/share/links";

/* The realm is for citizens, with one deliberate exception.
 *
 * A visitor who has not entered is sent back to the landing gate; a signed-in
 * visitor who has not sworn their oath is sent to the Maester. Only fully
 * entered members see the halls within.
 *
 * THE EXCEPTION, AND WHY IT HAD TO EXIST.
 *
 * Every route under app/(shell) sat behind this gate, including the six the
 * product spends real effort making shareable. So the whole distribution loop
 * ended at the last step and had done since the first Open Graph card shipped:
 * a member shared their Keep, the card unfurled beautifully on X, a stranger
 * tapped it, and this component replaced the Keep with the landing page before
 * they had seen a single reason to want an account. The share card was doing
 * its job and the gate was undoing it, silently, with nothing failing.
 *
 * A signed-out visitor may now READ the public share targets: a Keep, a crest
 * somebody holds, a Call, a House, a listing, a raven. Those are the exact
 * paths lib/share/links.ts can produce, and they are the exact paths its
 * Open Graph cards describe, because both come out of one table in that file.
 * If a moment can be shared, its page opens; if it cannot be shared, nothing
 * changed here.
 *
 * Reading is all they get. Every mutation in the product is a server route
 * behind requireProfile, which is unmoved: a visitor on a public Keep can see
 * the standing and cannot follow, tip, whisper or buy. The gate was never the
 * thing enforcing that, which is worth saying plainly, because a client-side
 * redirect that looks like a security boundary is the most dangerous kind of
 * decoration. It is a routing decision, and it always was.
 */
export function ShellGate({ children }: { children: React.ReactNode }) {
  const { ready, enabled, authenticated } = useRealmAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [cleared, setCleared] = useState(false);

  /* Resolved before any effect runs, so a public page never flashes the
     "Opening the gates" state on its way to being rendered. A share link that
     shows a loading spinner to a stranger has spent the only second of
     attention it was ever going to get. */
  const publicPage = isPublicSharePath(pathname ?? "");

  useEffect(() => {
    /* If the Gatehouse (Privy) is not configured, do not lock everyone out. */
    if (!enabled) {
      setCleared(true);
      return;
    }
    if (publicPage) {
      setCleared(true);
      return;
    }
    if (!ready) return;
    if (!authenticated) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await realmFetch<{ profile?: { onboarded?: boolean } }>(
          "/api/me",
          { method: "POST" }
        );
        if (cancelled) return;
        if (res.ok && res.data?.profile?.onboarded === false) {
          router.replace("/welcome");
          return;
        }
      } catch {
        /* server hiccup: let them in rather than trap them */
      }
      if (!cancelled) setCleared(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, enabled, authenticated, publicPage, router]);

  if (!enabled) return <>{children}</>;

  /* A public page renders immediately, signed in or out. A member who lands on
     one is still a member: nothing below this point knows the difference, and
     every surface on those pages already resolves the viewer from a verified
     bearer token rather than from the shell. */
  if (publicPage) return <>{children}</>;

  if (!ready || !authenticated || !cleared) {
    return (
      <div className="realm-bg flex min-h-screen flex-col items-center justify-center gap-4">
        <RavenMark className="h-12 w-12 animate-pulse" />
        <p className="text-xs uppercase tracking-[0.3em] text-bone-faint">
          Opening the gates
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
