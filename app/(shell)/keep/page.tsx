"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EditProfile } from "@/components/social/edit-profile";
import { ProfileView, type ProfileTab } from "@/components/social/profile-view";
import { fetchProfile } from "@/lib/social/queries";
import type { PublicProfile } from "@/lib/social/types";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Button } from "@/components/ui/button";
import {
  DossierMissing,
  DossierSkeleton,
} from "@/components/dossier/dossier-shell";

/* The member's own Keep. The Dossier is ProfileView, which the public
   /u/handle route renders too; this route resolves who the viewer is and
   answers honestly in the three states where there is no Keep to show yet.
   The Keep itself carries no back control, because it is a dock destination
   rather than somewhere a member was navigated into. */

/* The panel lives in the URL, so the Keep's tab line survives a reload and
   a shared link opens on the panel it names. The dock strip that once wrote
   these params is retired; the tab line under the identity block is the one
   switcher now. ProfileView stays uncontrolled for a public /u/handle, which
   has no param to answer. */
const TABS: ProfileTab[] = ["posts", "calls", "media", "hoard"];

function tabFromParam(raw: string | null): ProfileTab {
  return TABS.includes(raw as ProfileTab) ? (raw as ProfileTab) : "posts";
}

/* useSearchParams opts a component out of static rendering, so the reading
   half sits behind a boundary and the route still prerenders. */
export default function KeepPage() {
  return (
    <Suspense fallback={<DossierSkeleton />}>
      <KeepBody />
    </Suspense>
  );
}

function KeepBody() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabFromParam(params.get("tab"));

  const setTab = useCallback(
    (next: ProfileTab) => {
      const query = new URLSearchParams(params.toString());
      if (next === "posts") query.delete("tab");
      else query.set("tab", next);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const { ready, authenticated, enabled } = useRealmAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  /* Five states, and the fifth is the one that was missing. A Keep whose read
     did not land used to sit on the skeleton forever: the member saw the shape
     of their own Keep pulsing and was never told anything had gone wrong, and
     had no control to try again. A failed read is a state of its own, and it
     is the only one here with a way out that the member can operate. */
  const [state, setState] = useState<
    "loading" | "anon" | "onboard" | "failed" | "ok"
  >("loading");
  const [editOpen, setEditOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!ready) return;
    /* Only a Privy-confirmed signed-out visitor is anonymous. */
    if (!authenticated) {
      setState("anon");
      return;
    }
    let cancelled = false;
    setState("loading");
    void (async () => {
      const res = await realmFetch<{
        profile?: { handle: string | null; onboarded: boolean };
      }>("/api/me", { method: "POST" });
      if (cancelled) return;
      const me = res.data?.profile;
      if (!me) {
        /* Authenticated on the client but the server has no profile yet: a
           transient token or creation race, not a signed-out state. Retry a
           few times, then send them to finish onboarding rather than falsely
           claiming they are signed out. */
        if (tries < 4) {
          setTimeout(() => {
            if (!cancelled) setTries((t) => t + 1);
          }, 700);
          return;
        }
        setState("onboard");
        return;
      }
      if (!me.onboarded || !me.handle) {
        setState("onboard");
        return;
      }
      const full = await fetchProfile(me.handle);
      if (cancelled) return;
      if (!full) {
        /* The realm knows this member and knows their handle, so the Keep is
           there. The read of it simply did not land. */
        setState("failed");
        return;
      }
      setProfile(full);
      setState("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, refresh, tries]);

  /* Shaped like the Keep that is arriving, rather than one grey slab. */
  if (state === "loading") return <DossierSkeleton />;

  if (state === "anon")
    return (
      <DossierMissing
        title="My Keep"
        body={
          enabled
            ? "Your Keep rises when you enter the realm."
            : "Auth is not configured in this environment, so your Keep awaits on the hosted realm."
        }
        action={
          <Button variant="gold" size="lg" render={<Link href="/signin" />}>
            Enter the Realm
          </Button>
        }
      />
    );

  if (state === "onboard")
    return (
      <DossierMissing
        title="One step remains"
        body="Claim your name and swear to a House, and your Keep is raised."
        action={
          <Button variant="gold" size="lg" render={<Link href="/welcome" />}>
            See the Maester
          </Button>
        }
      />
    );

  if (state === "failed")
    return (
      <DossierMissing
        title="Your Keep would not open"
        body="The gates are yours and everything behind them is intact. The read simply did not reach the realm."
        action={
          <Button
            variant="glass"
            size="lg"
            onClick={() => setRefresh((n) => n + 1)}
          >
            Try again
          </Button>
        }
      />
    );

  return (
    <div>
      {profile && (
        <ProfileView
          profile={profile}
          own
          onEdit={() => setEditOpen(true)}
          tab={tab}
          onTabChange={setTab}
        />
      )}
      <EditProfile
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          setRefresh((n) => n + 1);
        }}
      />
    </div>
  );
}
