"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import {
  BANNER_STORAGE_KEY,
  isPublicSharePath,
  readBanner,
} from "@/lib/share/links";

/* WHAT A STRANGER SEES, AND WHERE THE BANNER IS CAUGHT.
 *
 * Two jobs, in one component, because they happen at the same instant and to
 * the same person: somebody who followed a shared link into the realm without
 * an account.
 *
 * JOB ONE: catch the banner. `/banners` mints links as `?banner=<handle>` and
 * until now only `/welcome` ever looked for that parameter. So a member who
 * shared their Keep and brought somebody in got no credit at all unless the
 * recruit happened to land on the oath page, which is the one page a share link
 * never points at. The banner is stowed under the key `/welcome` already uses,
 * so a recruit can land on a Call, wander the realm for a week, and still
 * credit the member who sent them when they finally swear the oath.
 *
 * This is the entire tracking surface of mission 10 and it is worth being
 * precise about what it is not. Nothing is sent anywhere when a link is opened.
 * No request is made, no identifier is minted, no row is written, and the value
 * stored is a public handle the sharer chose, not anything about the reader.
 * It becomes real only when a person completes onboarding, which is an act, and
 * `/api/onboard` has recorded exactly that in `referrals` since long before
 * this file existed. A link that phoned home on open would be a tracking pixel
 * with a fantasy theme, and it would measure the wrong thing anyway: the realm
 * wants to know who brought members, not who opened tabs.
 *
 * JOB TWO: say plainly that they are outside. A signed-out reader on a public
 * page gets the member shell, and a shell full of controls that would bounce
 * them is a worse welcome than a wall. The ribbon names the state and offers
 * the one action that changes it.
 *
 * REGISTER: Ledger. It is a persistent bar rather than a moment, so it is flat,
 * quiet and gets no gold beyond the button (rule 21). If this glowed, the Forge
 * budget on the page it sits under would be worth nothing.
 */
export function VisitorRibbon() {
  const { ready, enabled, authenticated } = useRealmAuth();
  const pathname = usePathname();
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    /* Read from the live location rather than useSearchParams: this component
       renders inside the shell on every route, and useSearchParams opts every
       statically rendered page in the shell out of prerendering. */
    const raised = readBanner(window.location.search);
    if (raised) {
      try {
        window.localStorage.setItem(BANNER_STORAGE_KEY, raised);
      } catch {
        /* Private browsing or a storage quota. The banner is lost, which costs
           one referral credit and nothing else; it must never break the page a
           stranger came to read. */
      }
    }
    try {
      setBanner(raised ?? window.localStorage.getItem(BANNER_STORAGE_KEY));
    } catch {
      setBanner(raised);
    }
  }, [pathname]);

  /* Members see nothing. Neither does anybody on a page that was never public,
     since the gate would have moved them along already. */
  if (!enabled || !ready || authenticated) return null;
  if (!isPublicSharePath(pathname ?? "")) return null;

  const href = banner
    ? `/welcome?banner=${encodeURIComponent(banner)}`
    : "/signin";

  return (
    <div className="border-b border-steel-line/70 bg-panel/80 px-3 py-2 sm:px-4">
      <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center gap-x-3 gap-y-2">
        <Icon name="raven" className="h-4 w-4 shrink-0 text-gold" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-bone-mut">
          {banner ? (
            <>
              You are reading The Ravenspire as a guest, at{" "}
              <span className="text-bone">@{banner}</span>
              {"'"}s invitation.
            </>
          ) : (
            "You are reading The Ravenspire as a guest."
          )}
        </p>
        <Button
          variant="gold"
          size="sm"
          dense
          className="shrink-0"
          render={<Link href={href} />}
        >
          Enter the realm
        </Button>
      </div>
    </div>
  );
}
