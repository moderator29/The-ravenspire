"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { realmFetch } from "@/lib/auth/api";
import { fetchViewer } from "@/lib/social/profile-queries";
import { fetchIsFollowing } from "@/lib/social/profile-queries";

/* A compact, self-contained Follow toggle for lists (Explore, right rail,
   dossier). It resolves the viewer's real relationship to the target so the
   label is true on load, hides itself on the viewer's own row, and writes
   through the same /api/social verb the Keep uses.

   Callers that render many rows can resolve the viewer once and pass
   `viewerId` + `initialFollowing` to skip the per-row lookups (the Crossroads
   does this); left unset, the button resolves its own state. */
export function FollowButton({
  targetId,
  viewerId,
  initialFollowing,
  size = "sm",
  onChange,
}: {
  targetId: string;
  viewerId?: string | null;
  initialFollowing?: boolean;
  size?: "sm" | "md";
  onChange?: (following: boolean) => void;
}) {
  const [resolvedViewer, setResolvedViewer] = useState<string | null>(
    viewerId ?? null
  );
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [ready, setReady] = useState(
    initialFollowing !== undefined && viewerId !== undefined
  );
  const [pending, setPending] = useState(false);

  /* Resolve viewer + relationship only when the caller did not pre-seed it. */
  useEffect(() => {
    if (viewerId !== undefined && initialFollowing !== undefined) return;
    let cancelled = false;
    void fetchViewer().then((v) => {
      if (cancelled) return;
      setResolvedViewer(v?.id ?? null);
      if (v?.id && v.id !== targetId) {
        void fetchIsFollowing(v.id, targetId).then((f) => {
          if (!cancelled) {
            setFollowing(f);
            setReady(true);
          }
        });
      } else {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [targetId, viewerId, initialFollowing]);

  useEffect(() => {
    if (viewerId !== undefined) setResolvedViewer(viewerId);
  }, [viewerId]);
  useEffect(() => {
    if (initialFollowing !== undefined) setFollowing(initialFollowing);
  }, [initialFollowing]);

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (pending) return;
      const on = !following;
      setFollowing(on);
      setPending(true);
      onChange?.(on);
      const res = await realmFetch("/api/social", {
        method: "POST",
        json: { action: "follow", subject_id: targetId, on },
      });
      setPending(false);
      if (!res.ok) {
        // Revert on failure so the button never lies about the real state.
        setFollowing(!on);
        onChange?.(!on);
      }
    },
    [following, pending, targetId, onChange]
  );

  // Never offer to follow yourself, and stay hidden until the state is known.
  if (!ready) {
    /* Shaped like the control it stands in for, so the row does not jump when
       the real relationship resolves. */
    return (
      <Skeleton
        radius="md"
        className={`shrink-0 max-md:h-11 ${size === "md" ? "h-11 w-24" : "h-9 w-20"}`}
      />
    );
  }
  if (resolvedViewer && resolvedViewer === targetId) return null;

  return (
    <Button
      variant={following ? "glass" : "gold"}
      size={size === "md" ? "lg" : "md"}
      onClick={toggle}
      aria-pressed={following}
      /* 44px on touch whatever the caller asked for, per the accessibility
         rule that touch targets never follow the declared density. */
      className={`shrink-0 max-md:h-11 ${following ? "text-bone-mut" : ""}`}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
