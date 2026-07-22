"use client";

import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { RavenMark } from "@/components/brand/raven-mark";
import { LandingIcon, type LandingIconName } from "@/components/landing/icons";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/*
  The Gatehouse. A premium split entry, cohesive with the landing: an ambient
  brand panel on the left, the three sign-in methods on the right. The auth
  logic (signInX / signInEmail / connectWallet from useRealmAuth) is wired
  exactly as before; only presentation and flow changed here.
*/

const assurances: { icon: LandingIconName; title: string; body: string }[] = [
  {
    icon: "shieldKey",
    title: "You keep your keys",
    body: "A Privy embedded wallet is minted to you on entry. Export it any time.",
  },
  {
    icon: "lock",
    title: "We never hold funds",
    body: "The platform takes no custody. Every action is signed by you alone.",
  },
  {
    icon: "badge",
    title: "Earned, never bought",
    body: "No presale, no seats for sale. Standing in the realm is earned in the open.",
  },
];

export default function SignInPage() {
  /* Routing into the realm after sign-in is handled globally by the
     PostAuthGate, so it works no matter where the login completes. */
  const { ready, enabled, authenticated, signInX, signInEmail, connectWallet } =
    useRealmAuth();

  return (
    <MotionConfig reducedMotion="user">
      <main className="realm-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
        {/* Ambient warmth */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[55vh]"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(200,162,76,0.14), transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/2 h-72 w-[40rem] max-w-full -translate-x-1/2 opacity-30 blur-3xl"
          aria-hidden="true"
          style={{ background: "radial-gradient(circle, rgba(229,112,42,0.12), transparent 70%)" }}
        />

        {/* Back to the landing */}
        <Link
          href="/"
          className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-xl border border-gold/20 bg-void/60 px-3 py-2 text-[12px] font-medium text-bone-mut backdrop-blur transition hover:border-gold/40 hover:text-bone sm:left-6 sm:top-6"
        >
          <LandingIcon name="chevronLeft" className="h-4 w-4" />
          Back to the realm
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="glass relative z-10 grid w-full max-w-4xl overflow-hidden md:grid-cols-2"
        >
          {/* Left: ambient brand + assurances */}
          <div className="relative hidden flex-col justify-between border-r border-steel-line/60 bg-void/40 p-8 md:flex">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-30 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(200,162,76,0.22), transparent 70%)" }}
            />
            <div className="relative">
              <div className="flex items-center gap-2.5">
                <RavenMark className="h-9 w-9" />
                <span className="gold-text font-display text-lg font-semibold tracking-[0.14em]">
                  THE RAVENSPIRE
                </span>
              </div>
              <h2 className="mt-8 font-display text-2xl font-semibold leading-snug text-bone">
                Enter a realm that is{" "}
                <span className="gold-text">truly yours</span>
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-bone-mut">
                See every chain. Fear no rug. Rule your realm. The keys are yours
                from the first moment you cross the gate.
              </p>
            </div>

            <ul className="relative mt-8 flex flex-col gap-4">
              {assurances.map((a) => (
                <li key={a.title} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-void text-gold">
                    <LandingIcon name={a.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[13px] font-semibold text-bone">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-bone-mut">
                      {a.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: the sign-in methods */}
          <div className="flex flex-col justify-center p-8 sm:p-10">
            {/* Compact brand for mobile, where the left panel is hidden */}
            <div className="mb-8 flex flex-col items-center text-center md:hidden">
              <RavenMark className="h-12 w-12" />
              <h1 className="gold-text mt-3 font-display text-2xl font-semibold tracking-[0.1em]">
                THE RAVENSPIRE
              </h1>
              <p className="mt-2 text-[13px] text-bone-mut">
                See every chain. Fear no rug. Rule your realm.
              </p>
            </div>

            <div className="mb-6 hidden md:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-bone-faint">
                Enter the realm
              </p>
              <h1 className="mt-2 font-display text-2xl font-semibold text-bone">
                Choose your gate
              </h1>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={signInX}
                disabled={!enabled}
                className="btn-glass w-full px-4 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LandingIcon name="xlogo" className="h-4 w-4" />
                Continue with X
              </button>
              <button
                onClick={signInEmail}
                disabled={!enabled}
                className="btn-glass w-full px-4 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LandingIcon name="mail" className="h-[18px] w-[18px]" />
                Continue with Email
              </button>
              <div className="my-1 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-bone-faint">
                <span className="h-px flex-1 bg-steel-line" />
                or
                <span className="h-px flex-1 bg-steel-line" />
              </div>
              <button
                onClick={connectWallet}
                disabled={!enabled}
                className="btn-gold w-full px-4 py-3.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LandingIcon name="wallet" className="h-[18px] w-[18px]" />
                Connect Wallet
              </button>
            </div>

            <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-gold/15 bg-void/50 px-4 py-3">
              <LandingIcon name="shieldKey" className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
              <p className="text-[12px] leading-relaxed text-bone-mut">
                A non-custodial wallet is created for you. You keep your keys, we
                never take custody, and you can export any time.
              </p>
            </div>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-bone-faint">
              By entering, you agree to the{" "}
              <Link href="/legal/terms" className="text-bone-mut underline decoration-gold/40 underline-offset-2 transition hover:text-bone">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-bone-mut underline decoration-gold/40 underline-offset-2 transition hover:text-bone">
                Privacy Policy
              </Link>
              .
            </p>

            {ready && !enabled && (
              <p className="mt-3 text-center text-[11px] text-bone-faint">
                The Gatehouse keys are not configured in this environment. Auth
                goes live on the hosted realm.
              </p>
            )}
            {authenticated && (
              <p className="mt-3 text-center text-[11px] text-gold">
                You are already through the gate. Redirecting you into the realm.
              </p>
            )}
          </div>
        </motion.div>
      </main>
    </MotionConfig>
  );
}
