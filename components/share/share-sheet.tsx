"use client";

import { useCallback, useEffect, useState } from "react";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { shareOrCopy, type ShareResult } from "@/lib/share";
import { shareCardImagePath, shareUrl, type ShareTarget } from "@/lib/share/links";
import { useViewerHandle } from "@/lib/social/use-viewer";

/* THE SHARE SHEET: a moment worth opening, not just a link worth copying.
 *
 * ShareButton (components/share/share-button.tsx) is still correct for a
 * quiet, inline share affordance: it fires the OS share sheet or copies a
 * link with no ceremony, and most of the realm's share icons should stay
 * exactly that plain. This component is for the handful of surfaces (a Keep,
 * a Call, and any other subject renderShareCard() knows) where the moment
 * itself is worth showing before it is sent: the member sees the actual card
 * a stranger will see, in the realm's own Forge register, before choosing
 * where it goes.
 *
 * THE PREVIEW IS THE REAL CARD, not a second approximation of it. The <img>
 * below points at /api/share/card, which calls the exact same
 * lib/share/render.ts every opengraph-image.tsx route calls. What is shown
 * here is pixel-identical to what unfurls on X, Telegram or Discord, and to
 * what Save downloads: one renderer, three destinations.
 *
 * SAVE is a real download, not a screenshot prompt. Fetching the PNG as a
 * blob and handing the browser an object URL through a synthetic <a download>
 * works everywhere a share sheet like this runs; navigator.share with `files`
 * would be nicer on the few browsers that support it, but degrading straight
 * to a plain file download is a better floor than a feature only some
 * visitors could use.
 */

export function ShareSheet({
  target,
  subjectHandle,
  title,
  shareTitle,
  trigger,
  size = "sm",
}: {
  target: ShareTarget;
  /* Whose moment this is, for the referral banner. See ShareButton for the
     full reasoning: the banner rides only when the viewer is sharing their
     own subject. */
  subjectHandle?: string | null;
  /* The sheet's own heading, e.g. "Share your Keep". */
  title: string;
  /* What the system share sheet announces, when the member taps Share. */
  shareTitle?: string;
  /* A custom trigger element. Defaults to a plain Share button. */
  trigger?: React.ReactElement;
  /* The default trigger's own size. Ignored when `trigger` is supplied. */
  size?: "sm" | "md" | "lg";
}) {
  const viewerHandle = useViewerHandle();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ShareResult | "saved" | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (state === null) return;
    const timer = window.setTimeout(() => setState(null), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);

  const own =
    viewerHandle !== null &&
    typeof subjectHandle === "string" &&
    subjectHandle.trim().toLowerCase() === viewerHandle.toLowerCase();

  const url = origin ? shareUrl(origin, target, { handle: viewerHandle, own }) : null;
  const imagePath = shareCardImagePath(target);
  const imageUrl = origin ? `${origin}${imagePath}` : imagePath;

  const doShare = useCallback(async () => {
    if (!url) return;
    const result = await shareOrCopy(url, shareTitle);
    setState(result === "dismissed" ? null : result);
  }, [url, shareTitle]);

  const doCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }, [url]);

  const doSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "ravenspire.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setState("saved");
    } catch {
      setState("failed");
    } finally {
      setSaving(false);
    }
  }, [imageUrl, saving]);

  const doX = useCallback(() => {
    if (!url) return;
    const params = new URLSearchParams({ url });
    if (shareTitle) params.set("text", shareTitle);
    window.open(
      `https://twitter.com/intent/tweet?${params.toString()}`,
      "_blank",
      "noopener,noreferrer,width=550,height=420"
    );
  }, [url, shareTitle]);

  if (!url) return null;

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button variant="glass" size={size} dense onClick={() => setOpen(true)}>
          <Icon name="share" className="h-4 w-4" />
          Share
        </Button>
      )}
      <AdaptiveDialog open={open} onOpenChange={setOpen} title={title} size="md">
        <div className="flex flex-col gap-4">
          {/* The card itself. 1200x630 scaled to the sheet's own width, so the
              image a stranger sees is exactly what the member is looking at
              here, not a smaller mockup of it. */}
          <div className="overflow-hidden rounded-lg border border-gold/20 bg-obsidian shadow-overlay">
            {/* eslint-disable-next-line @next/next/no-img-element -- the OG
                render route is a plain PNG endpoint, not a Next static asset,
                and the point of this preview is that it is the unmodified
                bytes a stranger would fetch, not a resized reinterpretation
                of them. */}
            <img
              src={imageUrl}
              alt=""
              width={1200}
              height={630}
              className="aspect-[1200/630] w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="glass" size="sm" onClick={() => void doSave()} disabled={saving}>
              <Icon name={state === "saved" ? "check" : "download"} className="h-4 w-4" />
              {state === "saved" ? "Saved" : "Save"}
            </Button>
            <Button variant="glass" size="sm" onClick={() => void doCopy()}>
              <Icon name={state === "copied" ? "check" : "share"} className="h-4 w-4" />
              {state === "copied" ? "Copied" : "Copy link"}
            </Button>
            <Button variant="glass" size="sm" onClick={doX}>
              <Icon name="xlogo" className="h-4 w-4" />X
            </Button>
            <Button variant="gold" size="sm" onClick={() => void doShare()}>
              <Icon name={state === "shared" ? "check" : "share"} className="h-4 w-4" />
              {state === "shared" ? "Shared" : "Share"}
            </Button>
          </div>
          {state === "failed" ? (
            <p className="text-center text-xs text-ember">
              Could not complete that. The card is still above; try again.
            </p>
          ) : null}
        </div>
      </AdaptiveDialog>
    </>
  );
}

/* A compact icon-only trigger, for a header row where a labelled button would
   crowd the surface. Identical sheet underneath. */
export function ShareSheetIconTrigger({
  target,
  subjectHandle,
  title,
  shareTitle,
  label,
}: {
  target: ShareTarget;
  subjectHandle?: string | null;
  title: string;
  shareTitle?: string;
  label: string;
}) {
  return (
    <ShareSheet
      target={target}
      subjectHandle={subjectHandle}
      title={title}
      shareTitle={shareTitle}
      trigger={<IconButton icon="share" label={label} size="sm" variant="glass" />}
    />
  );
}
