"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import type { InterestFeature } from "@/lib/realm/interest";

/* The Notify me control (V2 Part Two, section 27.3), shared by LockedGate and
 * the /soon chapters. One promise, actually kept: pressing it writes a row to
 * the interest table through POST /api/interest, and interest counts are real
 * demand data for the launch decision.
 *
 * States:
 *   - Signed out: a gold link to /signin. Registering needs a member.
 *   - Signed in, not registered: gold "Notify me", POSTs on press.
 *   - Registered (now or on any earlier visit): a quiet, disabled glass
 *     "A raven will find you". Persisted server-side, so it survives mounts,
 *     devices and cleared storage; the mount check below reads it back.
 */

type NotifyState = "idle" | "sending" | "registered";

export function NotifyMe({
  feature,
  size = "lg",
  className,
}: {
  feature: InterestFeature;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { ready, authenticated } = useRealmAuth();
  const [state, setState] = useState<NotifyState>("idle");
  const [failed, setFailed] = useState(false);

  /* Read the registered state back on mount for signed-in members. A member
     who registered last week must land on the confirmed state, not on a
     button inviting them to promise again. */
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      const res = await realmFetch<{ features?: string[] }>("/api/interest");
      if (cancelled) return;
      if (res.ok && res.data?.features?.includes(feature)) {
        setState("registered");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, feature]);

  const register = async () => {
    setState("sending");
    setFailed(false);
    const res = await realmFetch<{ registered?: boolean }>("/api/interest", {
      method: "POST",
      json: { feature },
    });
    /* A duplicate registration answers 200 registered:true, so a retried
       press settles calm instead of erroring. */
    if (res.ok && res.data?.registered) {
      setState("registered");
      return;
    }
    if (res.status === 401) {
      window.location.assign("/signin");
      return;
    }
    setState("idle");
    setFailed(true);
  };

  if (state === "registered") {
    return (
      <Button variant="glass" size={size} className={className} disabled>
        A raven will find you
      </Button>
    );
  }

  /* Signed out: the promise needs a member, so the button is the door. While
     auth is still waking (ready false) render the same link; it is the right
     destination for an unknown caller and never flashes a dead control. */
  if (!ready || !authenticated) {
    return (
      <Button
        variant="gold"
        size={size}
        className={className}
        render={<Link href="/signin" />}
      >
        Notify me
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <Button
        variant="gold"
        size={size}
        className={className}
        loading={state === "sending"}
        onClick={register}
      >
        Notify me
      </Button>
      {failed ? (
        <span role="status" className="text-[11px] text-state-danger">
          The raven could not be sent. Try again.
        </span>
      ) : null}
    </span>
  );
}
