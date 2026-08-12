"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { realmFetch } from "@/lib/auth/api";

/* The Herald's read on a Call.

   House rule 5: every AI surface is a real Anthropic call reasoning over real
   data. This panel holds no copy of its own beyond the invitation to ask. It
   never renders a cached, canned or example reading, it never fills the space
   when the realm has no key, and it says plainly when the Herald cannot be
   reached rather than papering over it with something that looks like a
   reading and is not.

   The request is member triggered rather than automatic, because the call
   costs real money and a panel that fires on every page view would spend the
   realm's whole daily allowance on people scrolling past. */

export function CallAnalysis({ id, verdict }: { id: string; verdict: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showSkeleton = useDelayedLoading(loading);

  const ask = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const res = await realmFetch<{ text?: string; error?: string }>(
      `/api/calls/${encodeURIComponent(id)}/analysis`,
      { method: "POST" }
    );
    setLoading(false);
    if (res.data?.text) setText(res.data.text);
    else setError(res.data?.error ?? "The Herald could not be reached.");
  };

  return (
    <Card pad="md" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Icon name="raven" className="h-4 w-4 shrink-0 text-gold" />
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-bone-mut">
          The Herald reads it
        </h2>
      </div>

      {showSkeleton && (
        <div className="flex flex-col gap-2">
          <Skeleton radius="sm" className="h-3 w-full" />
          <Skeleton radius="sm" className="h-3 w-full" />
          <Skeleton radius="sm" className="h-3 w-2/5" />
        </div>
      )}

      {!loading && text && (
        <>
          <p className="text-sm leading-relaxed text-bone-mut">{text}</p>
          <p className="text-[11px] text-bone-faint">
            Written by @raven over this Call&apos;s real figures: the frozen
            difficulty, the measured volatility, the live price and the crowd.
            It is a reading, not advice, and it does not know the outcome.
          </p>
        </>
      )}

      {!loading && error && (
        <p role="alert" className="text-sm leading-relaxed text-state-danger">
          {error}
        </p>
      )}

      {!loading && !text && (
        <>
          <p className="text-sm leading-relaxed text-bone-faint">
            {verdict === "open"
              ? "Ask the Herald what would have to happen for this Call to land."
              : "Ask the Herald how this Call read against the difficulty it was sealed with."}
          </p>
          <Button
            variant="glass"
            size="md"
            onClick={() => void ask()}
            className="self-start"
          >
            <Icon name="raven" className="h-4 w-4" />
            {error ? "Ask again" : "Ask the Herald"}
          </Button>
        </>
      )}
    </Card>
  );
}
