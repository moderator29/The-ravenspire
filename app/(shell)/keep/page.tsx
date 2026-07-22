"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EditProfile } from "@/components/social/edit-profile";
import { ProfileView } from "@/components/social/profile-view";
import { fetchProfile } from "@/lib/social/queries";
import type { PublicProfile } from "@/lib/social/types";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

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

  if (state === "loading")
    return <div className="mx-auto max-w-2xl p-6"><div className="glass h-48 animate-pulse" /></div>;

  if (state === "anon")
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-bone">My Keep</h1>
        <p className="mt-3 text-sm text-bone-mut">
          {enabled
            ? "Your Keep rises when you enter the realm."
            : "Auth is not configured in this environment; your Keep awaits on the hosted realm."}
        </p>
        <Link href="/signin" className="btn-gold mt-6 inline-flex px-6 py-2.5 text-sm">
          Enter the Realm
        </Link>
      </div>
    );

  if (state === "onboard")
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-bone">
          One step remains
        </h1>
        <p className="mt-3 text-sm text-bone-mut">
          Claim your name and swear to a House, and your Keep is raised.
        </p>
        <Link href="/welcome" className="btn-gold mt-6 inline-flex px-6 py-2.5 text-sm">
          See the Maester
        </Link>
      </div>
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
