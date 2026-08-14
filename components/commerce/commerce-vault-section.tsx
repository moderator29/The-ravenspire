"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/card";
import { OrderHistory } from "@/components/commerce/order-history";
import { RedeemPanel } from "@/components/commerce/redeem-panel";

/* The commerce section of The Vault (V2 Part Two, section 38, slice 1).
 *
 * Order history is always shown for a signed-in member: past orders are real
 * recorded charges, so they belong in the Vault whether or not the chapter is
 * currently live. Redemption is gated on chests_live, read from GET /api/chests
 * (the client-safe flag source), so a sealed chapter shows an honest sealed
 * note instead of a control that only answers 423.
 */

export function CommerceVaultSection() {
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void realmFetch<{ live: boolean }>("/api/chests").then((res) => {
      if (cancelled) return;
      setLive(res.ok ? Boolean(res.data?.live) : false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Chests and orders" />
      <OrderHistory />

      {live === true ? (
        <RedeemPanel />
      ) : live === false ? (
        <Card variant="raised" radius="xl" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gold/25 bg-obsidian/70">
              <Icon name="lock" className="h-4 w-4 text-gold" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
                Coming soon
              </p>
              <h2 className="font-display text-base font-semibold text-bone">
                Redeem a Reliquary code
              </h2>
            </div>
          </div>
          <p className="text-sm text-bone-mut">
            Codes printed inside a King&rsquo;s Reliquary mint the digital twins
            of your cards. The box, and the codes, open at launch.
          </p>
          <Button
            variant="glass"
            size="md"
            className="self-start"
            render={<Link href="/warchests" />}
          >
            <Icon name="coin" className="h-4 w-4 text-gold" />
            See the Warchests
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
