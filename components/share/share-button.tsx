"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { shareOrCopy, type ShareResult } from "@/lib/share";
import { shareUrl, type ShareTarget } from "@/lib/share/links";
import { useViewerHandle } from "@/lib/social/use-viewer";

/* THE SHARE CONTROL, and never a dead one.
 *
 * The ladder itself is lib/share.ts, which already existed and which six
 * surfaces already use: the system sheet on a phone, the clipboard on a
 * desktop, a legacy textarea copy where the clipboard API is unavailable
 * (an insecure origin, an old browser, a refused permission). This component
 * deliberately does not re-derive any of that. A seventh copy of the ladder
 * would be a seventh set of edge cases, and the legacy fallback in particular
 * is the rung that makes the promise true.
 *
 * WHAT THIS ADDS on top of it, which is the part mission 10 needed:
 *
 *   1. The URL comes from lib/share/links.ts rather than being interpolated at
 *      the call site. Six surfaces were each building their own share URL by
 *      hand, and the referral banner has to be decided per link.
 *   2. When there is nothing real to share, there is NO BUTTON. shareUrl
 *      returns null for a subject that does not resolve to a real path, and
 *      this renders nothing rather than a disabled control. A disabled share
 *      button on a thing that exists is a bug report; no button is a surface
 *      that is not shareable, which is the honest state while a chapter is
 *      sealed.
 *   3. A dismissed sheet says nothing. shareOrCopy returns "dismissed" for it,
 *      distinct from a success, so cancelling does not flash "Shared".
 *   4. A genuine failure says so. "Could not share" is a worse outcome than a
 *      copy, and it is a much better outcome than a button that appears to
 *      work and does not.
 */

export function ShareButton({
  target,
  subjectHandle,
  title,
  label = "Share",
  size = "sm",
  variant = "glass",
  className,
}: {
  target: ShareTarget;
  /* Whose moment this is. The referral banner rides along only when the viewer
     IS this member, which the control works out itself rather than trusting a
     caller to pass a boolean. That is deliberate: an `own` prop would be got
     wrong exactly once, on the surface where a member shares somebody else's
     Keep, and the symptom would be silently taking a recruit the subject had
     at least as good a claim to. Leave it undefined for a subject with no
     owner, such as a chest proof, and no banner is attached at all. */
  subjectHandle?: string | null;
  /* What the system share sheet announces. Optional: the sheet shows the URL
     either way, and the page's own Open Graph card carries the real headline. */
  title?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "glass" | "gold" | "ghost";
  className?: string;
}) {
  const viewerHandle = useViewerHandle();
  const [origin, setOrigin] = useState<string | null>(null);
  const [state, setState] = useState<ShareResult | null>(null);

  /* The origin is read after mount rather than from an environment variable,
     so a preview deployment shares preview links and a local build shares
     local ones. It is also why nothing renders during the server pass: there
     is no honest URL to put in the markup yet. */
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  /* The confirmation is a label change and not a toast: this control usually
     sits in a header row, where a toast would cover the thing just shared. */
  useEffect(() => {
    if (state === null) return;
    const timer = window.setTimeout(() => setState(null), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const own =
    viewerHandle !== null &&
    typeof subjectHandle === "string" &&
    subjectHandle.trim().toLowerCase() === viewerHandle.toLowerCase();

  const url = origin
    ? shareUrl(origin, target, { handle: viewerHandle, own })
    : null;

  const act = useCallback(async () => {
    if (!url) return;
    const result = await shareOrCopy(url, title);
    /* Dismissed is a choice, not an outcome to report back. */
    setState(result === "dismissed" ? null : result);
  }, [url, title]);

  if (!url) return null;

  const shown =
    state === "shared"
      ? "Shared"
      : state === "copied"
        ? "Link copied"
        : state === "failed"
          ? "Could not share"
          : label;

  return (
    <Button
      variant={variant}
      size={size}
      dense
      className={className}
      onClick={() => void act()}
    >
      <Icon
        name={
          state === "shared" || state === "copied"
            ? "check"
            : state === "failed"
              ? "alert"
              : "share"
        }
        className="h-4 w-4"
      />
      {shown}
    </Button>
  );
}
