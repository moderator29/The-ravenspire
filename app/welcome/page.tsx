"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RavenMark } from "@/components/brand/raven-mark";
import { houses } from "@/lib/data/houses";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { Icon } from "@/components/ui/icon";
import { markOnboardedLocal } from "@/lib/auth/session";

const sigilIcon: Record<string, string> = {
  raven: "raven",
  flame: "flame",
  snowflake: "shield",
  storm: "signal",
  moon: "eye",
  lion: "crown",
};

export default function WelcomePage() {
  const router = useRouter();
  const { ready, authenticated, xHandle, displayName: xName } = useRealmAuth();
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [house, setHouse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* Keep the raised banner through the sign-in detour. */
    const banner = new URLSearchParams(window.location.search).get("banner");
    if (banner) localStorage.setItem("rvn_banner", banner);
    if (!ready) return;
    if (!authenticated) {
      router.replace("/signin");
      return;
    }
    /* The server is the single source of truth for onboarded status. A stale
       local flag once bounced a not-yet-onboarded member straight back to the
       shell, which sent them here again, an endless loop. Ask the server: only
       a genuinely onboarded member is carried on to the realm; everyone else
       stays and swears the oath. */
    let cancelled = false;
    void realmFetch<{ profile?: { onboarded?: boolean } }>("/api/me", {
      method: "POST",
    }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.profile?.onboarded === true) {
        markOnboardedLocal(handle || "", house || "");
        router.replace("/home");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, router, handle, house]);

  /* Prefill the oath from the X account so members are not typing their name
     and handle from scratch. They can still edit both; the handle is checked
     for uniqueness on submit. */
  useEffect(() => {
    if (prefilled) return;
    if (!xHandle && !xName) return;
    setPrefilled(true);
    if (xHandle) {
      setHandle(
        xHandle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20)
      );
    }
    if (xName) setDisplayName(xName.slice(0, 40));
  }, [xHandle, xName, prefilled]);

  const finish = async () => {
    if (!house || busy) return;
    setBusy(true);
    setError(null);
    const referral =
      new URLSearchParams(window.location.search).get("banner") ??
      localStorage.getItem("rvn_banner");
    const res = await realmFetch<{ error?: string }>("/api/onboard", {
      method: "POST",
      json: {
        handle,
        house,
        display_name: displayName || undefined,
        referral: referral || undefined,
      },
    });
    setBusy(false);

    /* A real validation problem (name taken, bad handle) should stop us so
       the citizen can fix it. Any other failure means the server is not
       fully configured; we still carry them into the realm and remember
       them locally, so the gate is never a dead end. */
    if (!res.ok && (res.status === 400 || res.status === 409)) {
      setError(res.data?.error ?? "That name is spoken for. Choose another.");
      setStep(0);
      return;
    }

    markOnboardedLocal(handle, house);
    localStorage.removeItem("rvn_banner");
    router.replace("/home?welcome=1");
  };

  /* Never show the oath to a visitor who is not signed in. Until Privy is
     ready, or when the visitor is not authenticated (being sent to sign in),
     render only a neutral gate so no onboarding content leaks before login. */
  if (!ready || !authenticated) {
    return (
      <main className="realm-bg flex min-h-screen flex-col items-center justify-center gap-4">
        <RavenMark className="h-12 w-12 animate-pulse" />
        <p className="text-xs uppercase tracking-[0.3em] text-bone-faint">
          Opening the gates
        </p>
      </main>
    );
  }

  return (
    <main className="realm-bg flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <RavenMark className="h-12 w-12" />
      <h1 className="mt-3 font-display text-2xl font-semibold text-bone">
        The Maester welcomes you
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.28em] text-bone-faint">
        Step {step + 1} of 2
      </p>

      {step === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass mt-8 w-full max-w-md p-6"
        >
          {xHandle ? (
            /* Signed in with X: the handle is the X username, no need to pick
               one. It can still be changed later in settings. */
            <div className="rounded-xl border border-steel-line bg-void px-3 py-2.5">
              <p className="text-xs uppercase tracking-wider text-bone-faint">
                Your handle
              </p>
              <p className="mt-0.5 text-sm text-bone">
                @{handle || xHandle.toLowerCase()}
                <span className="ml-2 text-[11px] text-bone-faint">
                  from your X account
                </span>
              </p>
            </div>
          ) : (
            <>
              <label className="text-xs font-semibold uppercase tracking-wider text-bone-mut">
                Claim your name
              </label>
              <div className="mt-2 flex items-center gap-1 rounded-xl border border-steel-line bg-void px-3 py-2.5">
                <span className="text-bone-faint">@</span>
                <input
                  value={handle}
                  onChange={(e) =>
                    setHandle(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_]/g, "")
                        .slice(0, 20)
                    )
                  }
                  placeholder="your_handle"
                  className="min-w-0 flex-1 bg-transparent text-sm text-bone outline-none"
                />
              </div>
            </>
          )}
          <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-bone-mut">
            Display name (optional)
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            placeholder="How the realm knows you"
            className="mt-2 w-full rounded-xl border border-steel-line bg-void px-3 py-2.5 text-sm text-bone outline-none"
          />
          {error && <p className="mt-3 text-xs text-ember-deep">{error}</p>}
          <button
            onClick={() => handle.length >= 3 && setStep(1)}
            disabled={handle.length < 3}
            className="btn-gold mt-5 w-full py-2.5 text-sm disabled:opacity-50"
          >
            Choose your House
          </button>
        </motion.div>
      )}

      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 w-full max-w-2xl"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {houses.map((h) => (
              <button
                key={h.slug}
                onClick={() => setHouse(h.slug)}
                className={`glass glass-sm glass-hover p-4 text-left transition ${
                  house === h.slug ? "border-gold/60" : ""
                }`}
                style={
                  house === h.slug
                    ? { boxShadow: `0 0 30px ${h.color}22` }
                    : undefined
                }
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    name={sigilIcon[h.sigil] ?? "banner"}
                    className="h-5 w-5"
                  />
                  <p className="font-display text-base font-semibold text-bone">
                    {h.name}
                  </p>
                  {house === h.slug && (
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-gold">
                      Chosen
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs italic text-gold/80">{h.motto}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-bone-mut">
                  {h.desc}
                </p>
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-xs text-ember-deep">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => setStep(0)}
              className="btn-glass px-5 py-2.5 text-sm text-bone-mut"
            >
              Back
            </button>
            <button
              onClick={finish}
              disabled={!house || busy}
              className="btn-gold flex-1 py-2.5 text-sm disabled:opacity-50"
            >
              {busy ? "Swearing your oath..." : "Swear your sword"}
            </button>
          </div>
          <p className="mt-4 text-center text-[11px] text-bone-faint">
            Finishing onboarding earns your first crest: Took the Black.
          </p>
        </motion.div>
      )}
    </main>
  );
}
