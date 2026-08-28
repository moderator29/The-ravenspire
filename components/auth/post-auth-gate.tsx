"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { isOnboardedLocal, markOnboardedLocal } from "@/lib/auth/session";

/* After a citizen signs in on the gate, carry them into the realm. Only
   the sign-in hall triggers this, so the public landing page is never
   hijacked: a logged-in visitor who opens the website link still sees the
   landing and chooses when to enter. Uses the server's onboarded status
   when it answers, and the client's own memory as a fallback so a missing
   server key never traps anyone on the gate. */
const ENTRY = new Set(["/signin"]);

/* Where the member was going before the gate interrupted them.
 *
 * ShellGate writes `?next=<attempted path>` when it sends a signed-out visitor
 * to the Gatehouse, so a tap on "Calls" from the landing page finishes on
 * /calls rather than being quietly rerouted to the feed. The value is read
 * from the URL at redirect time, which makes it attacker-writable by
 * definition (anyone can hand out a /signin link), so it is accepted only as
 * a same-origin path: one leading slash, not two, because "//evil.example" is
 * a scheme-relative absolute URL and `router.replace` would follow it. */
function nextPath(): string | null {
  const raw = new URLSearchParams(window.location.search).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export function PostAuthGate() {
  const { ready, authenticated } = useRealmAuth();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated) {
      handled.current = false;
      return;
    }
    if (!ENTRY.has(pathname)) return;
    if (handled.current) return;
    handled.current = true;

    let cancelled = false;
    void (async () => {
      let onboarded = isOnboardedLocal();
      try {
        const res = await realmFetch<{
          profile?: { onboarded?: boolean };
        }>("/api/me", { method: "POST" });
        if (res.ok && res.data?.profile) {
          onboarded = Boolean(res.data.profile.onboarded);
          if (onboarded) markOnboardedLocal();
        }
      } catch {
        /* server unreachable: trust local memory */
      }
      if (cancelled) return;
      /* An onboarded member resumes the journey the gate interrupted; a new
         member swears the oath first, and /welcome carries them to the feed
         when it is done. Onboarding outranks the stashed destination on
         purpose: a Keep with no name on it is not ready to be anywhere. */
      router.replace(onboarded ? nextPath() ?? "/home" : "/welcome");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, pathname, router]);

  return null;
}
