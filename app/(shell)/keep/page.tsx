"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EditProfile } from "@/components/social/edit-profile";
import { ProfileView } from "@/components/social/profile-view";
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

export default function KeepPage() {
  const { ready, authenticated, enabled } = useRealmAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<"loading" | "anon" | "onboard" | "ok">(
    "loading"
  );
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
      if (full && !cancelled) {
        setProfile(full);
        setState("ok");
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
        <ProfileView profile={profile} own onEdit={() => setEditOpen(true)} />
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
