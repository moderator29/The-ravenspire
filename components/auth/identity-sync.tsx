"use client";

import { useEffect, useRef } from "react";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";

/* Once a member is signed in, push their X name, photo, handle and embedded
   wallet address from the Privy session to the server so the profile carries
   real identity even when the server side enrichment comes back empty. Runs
   once per authenticated session. */
export function IdentitySync() {
  const { ready, authenticated, xHandle, displayName, avatarUrl, address } =
    useRealmAuth();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated) {
      done.current = false;
      return;
    }
    if (done.current) return;
    /* Nothing to send yet; wait for the Privy user to populate. */
    if (!xHandle && !displayName && !avatarUrl && !address) return;
    done.current = true;
    void realmFetch("/api/profile/sync", {
      method: "POST",
      json: {
        x_handle: xHandle ?? undefined,
        display_name: displayName ?? undefined,
        avatar_url: avatarUrl ?? undefined,
        wallet_address: address ?? undefined,
      },
    });
  }, [ready, authenticated, xHandle, displayName, avatarUrl, address]);

  return null;
}
