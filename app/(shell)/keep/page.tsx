"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EditProfile } from "@/components/social/edit-profile";
import { ProfileView, type ProfileTab } from "@/components/social/profile-view";
import { fetchProfile } from "@/lib/social/queries";
import { withDeadline } from "@/lib/deadline";
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
  const [state, setState] = useState<
    "loading" | "anon" | "onboard" | "ok" | "error"
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
    void (async () => {
      /* Both reads sit under the same deadline the Ledger uses. A promise
         that never settles is not caught by a catch, and this effect's only
         other exits are the retry loop below and the two redirect states, so
         a hung read used to leave the Dossier skeleton pulsing for as long as
         the member stayed on their own Keep. */
      let res: Awaited<
        ReturnType<
          typeof realmFetch<{
            profile?: { handle: string | null; onboarded: boolean };
          }>
        >
      >;
      try {
        res = await withDeadline(
          realmFetch<{
            profile?: { handle: string | null; onboarded: boolean };
          }>("/api/me", { method: "POST" })
        );
      } catch {
        if (!cancelled) setState("error");
        return;
      }
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
      /* fetchProfile answers null for both "no such Keep" and "the read
         failed", and this route has already proven the handle exists via
         /api/me, so a null here is a failed read wearing a quiet face. The
         missing else branch was the /keep hang: nothing ever moved state off
         "loading", so the skeleton's claim that a Keep was arriving stayed
         false for as long as the member watched it. */
      try {
        const full = await withDeadline(fetchProfile(me.handle));
        if (cancelled) return;
        if (full) {
          setProfile(full);
          setState("ok");
        } else {
          setState("error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
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

  if (state === "error")
    return (
      <DossierMissing
        title="The Keep could not be reached"
        body="The realm did not answer in time. Your Keep is safe; the read is what failed."
        action={
          <Button
            variant="gold"
            size="lg"
            onClick={() => {
              setState("loading");
              setRefresh((n) => n + 1);
            }}
          >
            Try again
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
