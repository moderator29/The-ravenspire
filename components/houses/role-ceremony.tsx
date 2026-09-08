"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CeremonyCard } from "@/components/ui/ceremony-card";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* A House title, earned. Not a silent recompute.
 *
 * lib/houses/scoring.ts's recompute pass used to just write the new role and
 * move on: a member became Lord of their House, or held a title for the
 * first time in their life, and the only way they would ever know was
 * noticing a word changed on the House roster days later. GET
 * /api/houses/role-ceremony answers from house_members.role_celebrated,
 * cleared centrally by that same recompute the moment the promotion is
 * genuine (sworn to any title, or the instant a member reaches Lord
 * specifically); dismissing here POSTs the same route to flip it back, so it
 * never shows twice, on this device or any other.
 *
 * The same hand rolled portal TipSuccessCard uses and for the same reason:
 * this is a Ceremony, not a dialog, so it does not go through AdaptiveDialog,
 * which always draws its own titled header above the card's own headline.
 *
 * Mounted once, low in the shell, not on every route: a member who does not
 * open the app the instant they are promoted still gets the moment the next
 * time they do, since the pending state lives on the server. */
export function HouseRoleCeremony() {
  const { ready, authenticated } = useRealmAuth();
  const [pending, setPending] = useState<{
    role: { slug: string; title: string; earnedBy: string; icon: string };
    house: { slug: string; name: string };
  } | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    let alive = true;
    void realmFetch<{
      pending?: boolean;
      role?: { slug: string; title: string; earnedBy: string; icon: string };
      house?: { slug: string; name: string };
    }>("/api/houses/role-ceremony").then((res) => {
      if (!alive) return;
      if (res.ok && res.data?.pending && res.data.role && res.data.house) {
        setPending({ role: res.data.role, house: res.data.house });
      }
    });
    return () => {
      alive = false;
    };
  }, [ready, authenticated]);

  const dismiss = () => {
    setPending(null);
    void realmFetch("/api/houses/role-ceremony", { method: "POST" });
  };

  if (!pending || typeof document === "undefined") return null;

  const { role, house } = pending;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${role.title} of ${house.name}`}
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md">
        <CeremonyCard
          icon={role.icon}
          kicker="A title, earned"
          headline={role.title}
          subline={`of ${house.name}`}
          footnote={role.earnedBy}
        >
          <Button
            variant="gold"
            size="lg"
            block
            render={<Link href={`/houses/${house.slug}`} onClick={dismiss} />}
          >
            See your House
          </Button>
          <Button variant="ghost" size="md" block onClick={dismiss}>
            Continue
          </Button>
        </CeremonyCard>
      </div>
    </div>,
    document.body
  );
}
