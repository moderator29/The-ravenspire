"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { RavenMark } from "@/components/brand/raven-mark";

/* The realm is for citizens. A visitor who has not entered is sent back to
   the landing gate; a signed-in visitor who has not sworn their oath is sent
   to the Maester. Only fully entered members see the halls within. */
export function ShellGate({ children }: { children: React.ReactNode }) {
  const { ready, enabled, authenticated } = useRealmAuth();
  const router = useRouter();
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    /* If the Gatehouse (Privy) is not configured, do not lock everyone out. */
    if (!enabled) {
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
  }, [ready, enabled, authenticated, router]);

  if (!enabled) return <>{children}</>;

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
