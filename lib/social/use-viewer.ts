"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* Shared, cached lookup of the signed-in member's own identity. One request is
   made per session and reused across every card that needs to know whether a
   post is the viewer's own, so we do not fetch once per card.

   The handle joined the id here in mission 10 rather than getting a second
   hook and a second /api/me call. The share control has to know whether the
   viewer is the subject of what they are sharing, because that is what decides
   whether their referral banner honestly rides along, and that question is
   asked by a control that can appear several times on one page. */
type Viewer = { id: string | null; handle: string | null };

const EMPTY: Viewer = { id: null, handle: null };

let cached: Promise<Viewer> | null = null;

function fetchViewer(): Promise<Viewer> {
  if (!cached) {
    cached = realmFetch<{ profile?: { id?: string; handle?: string | null } }>(
      "/api/me",
      { method: "POST" }
    )
      .then((r) => ({
        id: r.data?.profile?.id ?? null,
        handle: r.data?.profile?.handle ?? null,
      }))
      .catch(() => EMPTY);
  }
  return cached;
}

export function fetchViewerId(): Promise<string | null> {
  return fetchViewer().then((v) => v.id);
}

export function resetViewerId() {
  cached = null;
}

function useViewer(): Viewer {
  const { ready, authenticated } = useRealmAuth();
  const [viewer, setViewer] = useState<Viewer>(EMPTY);

  useEffect(() => {
    if (!ready || !authenticated) {
      setViewer(EMPTY);
      return;
    }
    let cancelled = false;
    void fetchViewer().then((v) => {
      if (!cancelled) setViewer(v);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  return viewer;
}

export function useViewerId(): string | null {
  return useViewer().id;
}

/* The signed-in member's own handle, lowercase, or null for a visitor. */
export function useViewerHandle(): string | null {
  return useViewer().handle;
}
