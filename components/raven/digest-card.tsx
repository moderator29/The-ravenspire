"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CARD_ACTION_CLASS,
  SystemCard,
} from "@/components/stream/cards/card-shell";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* The Herald's digest, at the top of the Ravenry.
 *
 * What happened in the realm since the Herald last spoke to this member, in one
 * paragraph, written by a real model over figures the server counted. The route
 * behind it (/api/raven/digest) owns every decision; this component owns none.
 *
 * PINNED RATHER THAN IN THE STREAM
 * Every other realm event is a card in the timeline because every other realm
 * event happened at an instant. A digest is about a period, so it has no
 * position in a stream ordered by time, and dropping it in at "now" would put a
 * summary of the last six hours above the very ravens it summarises. It sits
 * above the feed instead, one card, once per window, dismissible.
 *
 * QUIETER THAN A RAVEN, DELIBERATELY
 * SystemCard, unchanged: the flat glyph in a steel tile rather than an avatar,
 * secondary text, no glow, the smaller footprint. Section 5 of the design
 * system is explicit that a system card must be structurally lower energy than
 * a member's own words, and this is the card most at risk of forgetting it,
 * because it is the one the realm most wants read. A Herald card that competes
 * with a member's raven turns the feed into advertising.
 *
 * NOTHING TO SAY IS THE COMMON CASE
 * A quiet realm, a sealed flag, no key configured, a model that did not answer:
 * all of them return no digest, and all of them render as nothing at all. There
 * is no error state and no fallback sentence, because a sentence the Herald did
 * not write, presented as the Herald, is worse than silence. */

interface DigestResponse {
  digest: { text: string; at: string } | null;
}

export function HeraldDigest() {
  const { ready, authenticated } = useRealmAuth();
  const [digest, setDigest] = useState<DigestResponse["digest"]>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void realmFetch<DigestResponse>("/api/raven/digest").then((res) => {
      if (!cancelled && res.data?.digest) setDigest(res.data.digest);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  if (!digest || dismissed) return null;

  /* Optimistic, and safe to be: the write is idempotent and the worst case of a
     failed dismissal is the card returning on the next visit, which is the same
     thing that happens when the window turns over anyway. */
  const dismiss = () => {
    setDismissed(true);
    void realmFetch("/api/raven/digest", { method: "DELETE" });
  };

  return (
    <div className="mb-3">
      <SystemCard
        at={digest.at}
        icon="raven"
        label="The Herald"
        rail="steel"
        action={
          <Button
            variant="ghost"
            size="sm"
            dense
            className={CARD_ACTION_CLASS}
            onClick={dismiss}
          >
            Dismiss
          </Button>
        }
      >
        <p>{digest.text}</p>
      </SystemCard>
    </div>
  );
}
