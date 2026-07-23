"use client";

import { useCallback, useEffect, useState } from "react";
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
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 animate-pulse rounded-full bg-panel ${
          size === "md" ? "h-8 w-20" : "h-7 w-16"
        }`}
      />
    );
  }
  if (resolvedViewer && resolvedViewer === targetId) return null;

  const pad = size === "md" ? "px-5 py-1.5 text-xs" : "px-3.5 py-1 text-[11px]";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={following}
      className={`shrink-0 rounded-full font-semibold transition ${pad} ${
        following ? "btn-glass text-bone-mut" : "btn-gold"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
