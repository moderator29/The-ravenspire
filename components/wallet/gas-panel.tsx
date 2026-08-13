"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Meter } from "@/components/ui/meter";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { useSponsorship } from "@/components/wallet/use-sponsorship";
import {
  readWalletGuardrails,
  type GuardrailsRead,
} from "@/components/wallet/wallet-guardrails-actions";

/* GAS, in the Vault, because the Vault is where a member goes to understand what
 * acting in this realm actually costs them.
 *
 * Archetype: Console. Flat, dense, right aligned counts on `tnum`, ornament
 * budget zero. Being told who pays for a transaction is a reading, not a reward,
 * and rendering it in the Forge register would be the product celebrating a
 * subsidy at somebody.
 *
 * THE PANEL SAYS WHO PAYS BEFORE THE MEMBER COMMITS TO ANYTHING, which is the
 * whole reason it exists. The failure this mission is built around is not a
 * member being charged gas; it is a member being told gas was covered and then
 * being charged it at the wallet prompt, when they have already decided. So the
 * headline is a plain sentence about who pays and, when it is the member, why.
 *
 * IT DISAPPEARS WHEN THE REALM HAS NOTHING TRUE TO SAY. A member in an
 * environment where gas cover was never configured is shown nothing at all
 * rather than a panel explaining a feature that does not exist. It appears the
 * moment the realm is either covering gas or has genuinely stopped covering it
 * for a reason the member can act on.
 */

export function GasPanel() {
  const sponsorship = useSponsorship();
  const [read, setRead] = useState<GuardrailsRead | null>(null);
  const [loaded, setLoaded] = useState(false);
  const showSkeleton = useDelayedLoading(!loaded, 300);

  useEffect(() => {
    let live = true;
    void readWalletGuardrails().then((next) => {
      if (!live) return;
      setRead(next);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, []);

  if (showSkeleton) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader title="Gas" />
        <Card radius="xl" pad="md">
          <Skeleton className="h-16 w-full" />
        </Card>
      </section>
    );
  }

  if (!loaded || !read) return null;

  /* Sealed and unconfigured are the ordinary state of a realm that has not
     turned gas cover on, and there is nothing here a member could do about
     either. Saying nothing is more honest than a panel describing an absence.
     Every other reason is a real state of a real feature and is shown. */
  const sponsorshipReport = read.sponsorship;
  const quiet =
    !sponsorshipReport.permitted &&
    (sponsorshipReport.reason === "sealed" ||
      sponsorshipReport.reason === "unconfigured");
  if (quiet) return null;

  const covered = sponsorship.ready && sponsorship.payer === "realm";
  const { member_used: used, member_allowance: allowance } = read.state;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Gas" hint="Who pays to put this on the chain" />

      <Card radius="xl" pad="md" className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5">
          <Icon
            name={covered ? "check" : "info"}
            className={`mt-0.5 h-4 w-4 shrink-0 ${covered ? "text-gold" : "text-bone-faint"}`}
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-bone">
              {!sponsorship.ready
                ? "Working out who pays"
                : covered
                  ? "The realm covers your gas"
                  : "You pay your own gas"}
            </p>
            {/* The reason, in the server's own words where the server had one.
                A member never has to guess which of five things happened. */}
            {sponsorship.reason ? (
              <p className="text-xs leading-relaxed text-bone-mut">
                {sponsorship.reason}
              </p>
            ) : covered ? (
              <p className="text-xs leading-relaxed text-bone-mut">
                Your own wallet still signs every transaction. The realm never
                holds your keys and never takes custody. All that changes is
                whose balance the fee comes out of.
              </p>
            ) : null}
          </div>
        </div>

        {/* The count, and only when there is one worth reading. A member who
            has used none of a cover that is not running has nothing to learn
            from a bar at zero. */}
        {used > 0 || covered ? (
          <div className="flex flex-col gap-1.5 border-t border-steel-line pt-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-bone-mut">
                Covered this month
              </span>
              <span className="tnum text-xs font-semibold text-bone">
                {used} of {allowance}
              </span>
            </div>
            <Meter value={used} max={allowance} />
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-bone-faint">
          Gas cover never changes who owns anything. Every transaction is signed
          by your own wallet, and one the realm did not pay for is identical in
          every other way.
        </p>
      </Card>
    </section>
  );
}
