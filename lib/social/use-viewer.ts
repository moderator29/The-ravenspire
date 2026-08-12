"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* Shared, cached lookup of the signed-in member's own profile id. One request
   is made per session and reused across every card that needs to know whether
   a post is the viewer's own, so we do not fetch once per card. */
let cached: Promise<string | null> | null = null;

export function fetchViewerId(): Promise<string | null> {
  if (!cached) {
    cached = realmFetch<{ profile?: { id?: string } }>("/api/me", {
      method: "POST",
    })
      .then((r) => r.data?.profile?.id ?? null)
      .catch(() => null);
  }
  return cached;
}

export function resetViewerId() {
  cached = null;
}

export function useViewerId(): string | null {
  const { ready, authenticated } = useRealmAuth();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) {
      setId(null);
      return;
    }
    let cancelled = false;
    void fetchViewerId().then((v) => {
      if (!cancelled) setId(v);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  return id;
}
