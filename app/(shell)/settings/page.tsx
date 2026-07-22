"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";
import { ReferralPanel } from "@/components/referral/referral-panel";
import { WalletSection } from "@/components/wallet/wallet-section";
import { AccountSecurity } from "@/components/settings/account-security";
import { Card, Row, Toggle, SectionHeader } from "@/components/settings/ui";
import { BackButton } from "@/components/shell/back-button";

interface MeProfile {
  id: string;
  handle: string | null;
  house_slug: string | null;
  onboarded: boolean;
  tier: string | null;
}

interface Prefs {
  publicPositions: boolean;
  pnlVisible: boolean;
  discoverable: boolean;
  notifyMentions: boolean;
  notifyReplies: boolean;
  notifyLikes: boolean;
  notifyReposts: boolean;
  notifyFollows: boolean;
  notifyTips: boolean;
  notifyWhispers: boolean;
  notifyCalls: boolean;
  notifyDuels: boolean;
  notifyHouse: boolean;
  notifyAnnouncements: boolean;
  voiceReplies: boolean;
  autoplayAudio: boolean;
  soundEffects: boolean;
}

/* PnL and public positions default ON: a member is visible unless they choose
   to hide. This matches the server-side gate in /api/profile/earnings, which
   treats an absent flag as ON. */
const DEFAULT_PREFS: Prefs = {
  publicPositions: true,
  pnlVisible: true,
  discoverable: true,
  notifyMentions: true,
  notifyReplies: true,
  notifyLikes: true,
  notifyReposts: true,
  notifyFollows: true,
  notifyTips: true,
  notifyWhispers: true,
  notifyCalls: true,
  notifyDuels: true,
  notifyHouse: true,
  notifyAnnouncements: true,
  voiceReplies: false,
  autoplayAudio: false,
  soundEffects: true,
};

/* Which settings bucket each toggle lives in, and its key inside that bucket.
   Buckets map to the profiles.settings jsonb the /api/settings route merges. */
const PREF_MAP: Record<
  keyof Prefs,
  { bucket: "privacy" | "notifications" | "voice"; key: string }
> = {
  publicPositions: { bucket: "privacy", key: "publicPositions" },
  pnlVisible: { bucket: "privacy", key: "pnlVisible" },
  discoverable: { bucket: "privacy", key: "discoverable" },
  notifyMentions: { bucket: "notifications", key: "mentions" },
  notifyReplies: { bucket: "notifications", key: "replies" },
  notifyLikes: { bucket: "notifications", key: "likes" },
  notifyReposts: { bucket: "notifications", key: "reposts" },
  notifyFollows: { bucket: "notifications", key: "follows" },
  notifyTips: { bucket: "notifications", key: "tips" },
  notifyWhispers: { bucket: "notifications", key: "whispers" },
  notifyCalls: { bucket: "notifications", key: "calls" },
  notifyDuels: { bucket: "notifications", key: "duels" },
  notifyHouse: { bucket: "notifications", key: "house" },
  notifyAnnouncements: { bucket: "notifications", key: "announcements" },
  voiceReplies: { bucket: "voice", key: "replies" },
  autoplayAudio: { bucket: "voice", key: "autoplay" },
  soundEffects: { bucket: "voice", key: "sound" },
};

type Bucket = Record<string, unknown>;
interface RealmSettings {
  privacy?: Bucket;
  notifications?: Bucket;
  appearance?: Bucket;
  voice?: Bucket;
}

function prefsFromSettings(settings: RealmSettings | null): Prefs {
  const next = { ...DEFAULT_PREFS };
  if (!settings) return next;
  for (const field of Object.keys(PREF_MAP) as (keyof Prefs)[]) {
    const { bucket, key } = PREF_MAP[field];
    const val = settings[bucket]?.[key];
    if (typeof val === "boolean") next[field] = val;
  }
  return next;
}

export default function SettingsPage() {
  const {
    ready,
    enabled,
    authenticated,
    displayName,
    signOut,
    signInX,
    signInEmail,
  } = useRealmAuth();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle"
  );

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void (async () => {
      const [me, settings] = await Promise.all([
        realmFetch<{ profile: MeProfile }>("/api/me", { method: "POST" }),
        realmFetch<{ settings: RealmSettings }>("/api/settings"),
      ]);
      if (cancelled) return;
      if (me.ok && me.data) setProfile(me.data.profile);
      if (settings.ok && settings.data)
        setPrefs(prefsFromSettings(settings.data.settings));
      setPrefsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated]);

  const setPref = (field: keyof Prefs) => (next: boolean) => {
    const prev = prefs[field];
    setPrefs((p) => ({ ...p, [field]: next }));
    const { bucket, key } = PREF_MAP[field];
    setSaveState("saving");
    void realmFetch("/api/settings", {
      method: "POST",
      json: { [bucket]: { [key]: next } },
    }).then((res) => {
      if (res.ok) {
        setSaveState("idle");
      } else {
        /* Roll back the optimistic toggle so the UI never lies about state. */
        setPrefs((p) => ({ ...p, [field]: prev }));
        setSaveState("error");
      }
    });
  };

  const locked = ready && !authenticated;
  const toggleDisabled = locked || !prefsLoaded;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      <BackButton />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-bone">
            Settings
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
            Your keep, your rules
          </p>
        </div>
        {saveState !== "idle" && !locked ? (
          <span
            className={`text-[11px] uppercase tracking-[0.2em] ${
              saveState === "error" ? "text-ember" : "text-bone-faint"
            }`}
          >
            {saveState === "error" ? "Save failed" : "Saving..."}
          </span>
        ) : null}
      </div>

      {!ready ? (
        <div className="glass mt-5 h-40 animate-pulse" />
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {locked ? (
            <section className="glass p-6 text-center sm:p-8">
              <h2 className="gold-text font-display text-xl font-semibold">
                Enter the realm to command your settings
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-bone-mut">
                The sections below unlock once you are signed in.
              </p>
              {enabled ? (
                <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={signInX}
                    className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-sm"
                  >
                    <Icon name="xlogo" className="h-4 w-4" />
                    Enter with X
                  </button>
                  <button
                    type="button"
                    onClick={signInEmail}
                    className="btn-glass inline-flex items-center gap-2 px-5 py-2.5 text-sm"
                  >
                    <Icon name="mail" className="h-4 w-4" />
                    Enter with email
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-xs text-bone-faint">
                  The Gatehouse is not mounted in this environment, so sign-in
                  is resting.
                </p>
              )}
            </section>
          ) : null}

          <div
            className={
              locked
                ? "pointer-events-none flex flex-col gap-3 opacity-50"
                : "flex flex-col gap-3"
            }
            aria-disabled={locked || undefined}
          >
            {/* ------------------------------------------------ Account */}
            <SectionHeader title="Account" hint="Who you are here" />

            <Card icon="user" title="Account" plain="Identity">
              <Row
                title="Display name"
                desc={locked ? "Sign in to see it" : undefined}
              >
                <span className="text-sm text-bone-mut">
                  {authenticated ? (displayName ?? "Unnamed wanderer") : "--"}
                </span>
              </Row>
              <Row
                title="Handle"
                desc={
                  authenticated && !profile
                    ? "Fetching from the archives"
                    : undefined
                }
              >
                <span className="tnum font-mono text-sm text-bone-mut">
                  {authenticated && profile?.handle
                    ? `@${profile.handle}`
                    : "--"}
                </span>
              </Row>
              <Row title="Leave the realm" desc="Sign out on this device">
                <button
                  type="button"
                  onClick={signOut}
                  disabled={locked}
                  className="btn-glass px-4 py-1.5 text-sm"
                >
                  Sign out
                </button>
              </Row>
            </Card>

            {/* Account security: recovery password, MFA, linked login methods.
                Privy-powered, so it only mounts when the Gatehouse is enabled. */}
            {enabled ? (
              <AccountSecurity />
            ) : (
              <Card icon="shield" title="Account & Security" plain="Resting">
                <p className="text-sm text-bone-mut">
                  The Gatehouse is not mounted in this environment, so recovery
                  passwords, two-factor enrollment, and linking or unlinking
                  login methods are resting. They return once sign-in is live.
                </p>
              </Card>
            )}

            {/* ------------------------------------------------- Wallet */}
            <SectionHeader title="Wallet" hint="Keys and coin" />
            <div className="flex items-center justify-end px-1">
              <Link
                href="/wallet"
                className="text-xs text-gold underline underline-offset-2"
              >
                Full view
              </Link>
            </div>
            <WalletSection />
            <p className="px-1 text-xs text-bone-faint">
              Your wallet is non-custodial. The Ravenspire never holds your keys and
              cannot move your funds; every transfer and key export happens on
              your device, and only you can authorize it.
            </p>

            {/* -------------------------------------------- Preferences */}
            <SectionHeader
              title="Preferences"
              hint="Saved to the Archives, on every device"
            />

            {/* Privacy */}
            <Card icon="eye" title="Privacy" plain="What others see">
              <Row
                title="Public positions"
                desc="Let others see your earning sources and allocation"
              >
                <Toggle
                  on={prefs.publicPositions}
                  onChange={setPref("publicPositions")}
                  disabled={toggleDisabled}
                  label="Public positions"
                />
              </Row>
              <Row
                title="Show my PnL / earnings"
                desc="Show your $RSP earnings and balance on your Keep"
              >
                <Toggle
                  on={prefs.pnlVisible}
                  onChange={setPref("pnlVisible")}
                  disabled={toggleDisabled}
                  label="PnL visibility"
                />
              </Row>
              <Row
                title="Discoverable"
                desc="Appear in search and on leaderboards"
              >
                <Toggle
                  on={prefs.discoverable}
                  onChange={setPref("discoverable")}
                  disabled={toggleDisabled}
                  label="Discoverable"
                />
              </Row>
            </Card>

            {/* Notifications */}
            <Card
              icon="bell"
              title="Notifications"
              plain="Ravens at your window"
            >
              <Row title="Mentions" desc="When someone names you">
                <Toggle
                  on={prefs.notifyMentions}
                  onChange={setPref("notifyMentions")}
                  disabled={toggleDisabled}
                  label="Mention notifications"
                />
              </Row>
              <Row title="Replies" desc="Answers to your ravens">
                <Toggle
                  on={prefs.notifyReplies}
                  onChange={setPref("notifyReplies")}
                  disabled={toggleDisabled}
                  label="Reply notifications"
                />
              </Row>
              <Row title="Admiration" desc="When someone likes your raven">
                <Toggle
                  on={prefs.notifyLikes}
                  onChange={setPref("notifyLikes")}
                  disabled={toggleDisabled}
                  label="Like notifications"
                />
              </Row>
              <Row title="Re-ravens" desc="When your words are shared onward">
                <Toggle
                  on={prefs.notifyReposts}
                  onChange={setPref("notifyReposts")}
                  disabled={toggleDisabled}
                  label="Repost notifications"
                />
              </Row>
              <Row title="New bannermen" desc="When someone follows you">
                <Toggle
                  on={prefs.notifyFollows}
                  onChange={setPref("notifyFollows")}
                  disabled={toggleDisabled}
                  label="Follow notifications"
                />
              </Row>
              <Row title="Tribute" desc="When you receive a tip">
                <Toggle
                  on={prefs.notifyTips}
                  onChange={setPref("notifyTips")}
                  disabled={toggleDisabled}
                  label="Tip notifications"
                />
              </Row>
              <Row title="Whispers" desc="New direct messages">
                <Toggle
                  on={prefs.notifyWhispers}
                  onChange={setPref("notifyWhispers")}
                  disabled={toggleDisabled}
                  label="Whisper notifications"
                />
              </Row>
              <Row title="Call verdicts" desc="When your Call is judged">
                <Toggle
                  on={prefs.notifyCalls}
                  onChange={setPref("notifyCalls")}
                  disabled={toggleDisabled}
                  label="Call verdict notifications"
                />
              </Row>
              <Row title="Duels" desc="Challenges and verdicts">
                <Toggle
                  on={prefs.notifyDuels}
                  onChange={setPref("notifyDuels")}
                  disabled={toggleDisabled}
                  label="Duel notifications"
                />
              </Row>
              <Row title="House calls" desc="Word from your banner">
                <Toggle
                  on={prefs.notifyHouse}
                  onChange={setPref("notifyHouse")}
                  disabled={toggleDisabled}
                  label="House notifications"
                />
              </Row>
              <Row title="Announcements" desc="Realm-wide news and updates">
                <Toggle
                  on={prefs.notifyAnnouncements}
                  onChange={setPref("notifyAnnouncements")}
                  disabled={toggleDisabled}
                  label="Announcement notifications"
                />
              </Row>
            </Card>

            {/* Voice & Audio */}
            <Card icon="signal" title="Voice & Audio" plain="Sound of the realm">
              <Row
                title="Voice replies"
                desc="Read new ravens aloud when they arrive"
              >
                <Toggle
                  on={prefs.voiceReplies}
                  onChange={setPref("voiceReplies")}
                  disabled={toggleDisabled}
                  label="Voice replies"
                />
              </Row>
              <Row title="Autoplay audio" desc="Play voice clips automatically">
                <Toggle
                  on={prefs.autoplayAudio}
                  onChange={setPref("autoplayAudio")}
                  disabled={toggleDisabled}
                  label="Autoplay audio"
                />
              </Row>
              <Row title="Sound effects" desc="Chimes for duels and verdicts">
                <Toggle
                  on={prefs.soundEffects}
                  onChange={setPref("soundEffects")}
                  disabled={toggleDisabled}
                  label="Sound effects"
                />
              </Row>
            </Card>

            {/* Appearance */}
            <Card icon="orb" title="Appearance" plain="The realm's look">
              <Row
                title="Reduced motion"
                desc="We follow your system's preference automatically"
              >
                <span className="text-xs uppercase tracking-[0.2em] text-bone-faint">
                  Respected
                </span>
              </Row>
              <Row title="Theme" desc="Obsidian is the realm's only sky">
                <span className="text-xs uppercase tracking-[0.2em] text-bone-faint">
                  Obsidian
                </span>
              </Row>
            </Card>

            {/* ----------------------------------------------- Referral */}
            <SectionHeader title="Referral" hint="Raise your banner" />
            <Card icon="banner" title="Referral" plain="Bring your bannermen">
              <ReferralPanel enabled={authenticated} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
