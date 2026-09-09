"use client";

import { useCallback, useState } from "react";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/* Share your Coffers: the one card in the set with no public link, only a
 * downloadable image, because the figure on it is not meant to unfurl for a
 * stranger holding a URL (see lib/share/render.ts's renderCoffersCard). The
 * preview is /api/share/coffers, a session-only route that always renders
 * the caller's own statement.
 *
 * No Copy link and no direct X/Telegram button here, unlike ShareSheet: there
 * is genuinely nothing to copy. Save is the primary action; a native
 * file-share is offered only where the browser can actually hand off a file
 * (navigator.canShare({ files })), rather than a button that would silently
 * do nothing everywhere else.
 */

const IMAGE_PATH = "/api/share/coffers";

export function CoffersShare() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"saved" | "shared" | "failed" | null>(null);
  const [canFileShare, setCanFileShare] = useState(false);

  const fetchBlob = useCallback(async () => {
    const res = await fetch(IMAGE_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("fetch failed");
    return res.blob();
  }, []);

  const doSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await fetchBlob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "the-coffers.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setState("saved");
    } catch {
      setState("failed");
    } finally {
      setBusy(false);
    }
  }, [busy, fetchBlob]);

  const doFileShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await fetchBlob();
      const file = new File([blob], "the-coffers.png", { type: blob.type || "image/png" });
      await navigator.share({ files: [file], title: "The Coffers, The Ravenspire" });
      setState("shared");
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name !== "AbortError") setState("failed");
    } finally {
      setBusy(false);
    }
  }, [busy, fetchBlob]);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      try {
        setCanFileShare(
          typeof navigator !== "undefined" &&
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] })
        );
      } catch {
        setCanFileShare(false);
      }
    } else {
      setState(null);
    }
  }, []);

  return (
    <>
      <Button variant="glass" size="sm" dense onClick={() => onOpenChange(true)}>
        <Icon name="share" className="h-4 w-4" />
        Share
      </Button>
      <AdaptiveDialog open={open} onOpenChange={onOpenChange} title="Share your Coffers" size="md">
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-lg border border-gold/20 bg-obsidian shadow-overlay">
            {/* eslint-disable-next-line @next/next/no-img-element -- a plain
                PNG endpoint, not a Next static asset; see ShareSheet for the
                same reasoning. */}
            <img
              src={IMAGE_PATH}
              alt=""
              width={1200}
              height={630}
              className="aspect-[1200/630] w-full"
            />
          </div>
          <div className={`grid gap-2 ${canFileShare ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button variant="gold" size="sm" onClick={() => void doSave()} disabled={busy}>
              <Icon name={state === "saved" ? "check" : "download"} className="h-4 w-4" />
              {state === "saved" ? "Saved" : "Save image"}
            </Button>
            {canFileShare ? (
              <Button variant="glass" size="sm" onClick={() => void doFileShare()} disabled={busy}>
                <Icon name={state === "shared" ? "check" : "share"} className="h-4 w-4" />
                {state === "shared" ? "Shared" : "Share"}
              </Button>
            ) : null}
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
