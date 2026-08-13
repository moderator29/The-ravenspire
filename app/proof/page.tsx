import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { DrawVerifier } from "@/components/collectibles/draw-verifier";

export const metadata: Metadata = {
  title: "Check a chest draw",
  description:
    "Rerun any Warchest opening in your own browser. The seed is committed before the chest is opened and revealed when it is, so anybody can check the draw without trusting the realm.",
};

/* THE VERIFIER, at /proof. Deliberately OUTSIDE the shell, and that is a
 * decision rather than a routing accident.
 *
 * Everything under `app/(shell)` sits behind `ShellGate`, which sends a visitor
 * who has not entered the realm back to the landing page. A verifier behind
 * that gate would only ever be usable by members, which quietly undoes the
 * whole feature: the argument for provable fairness is that a stranger with no
 * account, no stake and every reason to disbelieve can pick a draw and check it.
 * Make them sign up first and you are back to "trust us", with an extra step.
 *
 * So this page has no gate, no member data on it, and reads two public
 * endpoints that carry no credentials.
 *
 * ARCHETYPE: Console. Dense controls plus dense data, compact, ornament zero.
 * The chest opening itself is the Ceremony and keeps every bit of its gold.
 * This is the audit, and an audit that glows is an audit congratulating itself.
 *
 * REAL DATA ONLY. There is no worked example on this page, because a worked
 * example of a provably fair draw is indistinguishable from a fabricated
 * opening, and `chest_openings` is empty: nothing grants an entitlement yet and
 * `chests_live` is off. The list of openings renders an honest empty state, the
 * lookup answers 404 for every reference because there are none, and the manual
 * mode reruns whatever three inputs a member types. That last one is the only
 * honest way to show the algorithm working with no data behind it, and the
 * verdict it produces says "recomputed", never "verified".
 */

const STEPS = [
  {
    icon: "lock" as const,
    title: "The realm commits first",
    body: "Before you open anything, the realm generates a secret seed and publishes its hash. It goes first, before it knows what you will choose, so it cannot pick a seed to suit you.",
  },
  {
    icon: "feather" as const,
    title: "You answer",
    body: "You set a seed of your own, any text you like, having already seen that hash. The realm cannot know it in advance, so it cannot pick a seed to suit that either.",
  },
  {
    icon: "eye" as const,
    title: "The chest reveals",
    body: "Opening a chest publishes the seed that drew it and retires it forever. Hash the revealed seed, check it against the hash you were shown first, and rerun the draw here.",
  },
];

export default function ProofPage() {
  return (
    <div className="realm-bg min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6">
        <div className="flex">
          {/* A visitor who arrived cold has no realm behind them, so the
              fallback is the gate rather than a page they cannot enter. */}
          <BackButton href="/" />
        </div>

        <header className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
            Warchests &middot; Provably fair
          </p>
          <h1 className="gold-text font-display text-2xl font-semibold sm:text-3xl">
            Check any chest draw yourself
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-bone-mut">
            A chest is a pure function of three inputs, and the realm publishes
            all three the moment a chest is opened. Everything on this page runs
            in your browser: the draw is rerun on your own machine, from code you
            can read, and the realm is never asked whether it agrees with the
            answer. It is asked only for the record it already published.
          </p>
          <p className="max-w-2xl text-xs leading-relaxed text-bone-faint">
            You do not need an account, and you do not need to have opened the
            chest. Any settled opening in the realm can be checked by anybody.
          </p>
        </header>

        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title} variant="inset" radius="lg" className="flex flex-col gap-1.5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
                <Icon name={step.icon} className="h-3.5 w-3.5 shrink-0" />
                {["One", "Two", "Three"][i]}
              </p>
              <p className="text-[13px] font-semibold text-bone">{step.title}</p>
              <p className="text-xs leading-relaxed text-bone-mut">{step.body}</p>
            </Card>
          ))}
        </ol>

        {/* The verifier reads `?draw=` so a member can arrive from the opening
            with their own chest already loaded, and useSearchParams opts a
            component out of static rendering. Without this boundary the page
            fails to prerender at build time. */}
        <Suspense fallback={null}>
          <DrawVerifier />
        </Suspense>

        <Card variant="inset" radius="lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
            What this proves, and what it does not
          </p>
          {/* Stating the residual trust plainly is the difference between a
              fairness feature and a marketing one. A scheme that oversells
              itself is doing the same thing as a scheme that hides its odds. */}
          <div className="mt-2 flex flex-col gap-2 text-xs leading-relaxed text-bone-mut">
            <p>
              The rerun is yours. Nothing on this page asks the realm whether the
              numbers agree, so a realm that faked a draw cannot cover it by
              answering carelessly here.
            </p>
            <p>
              What the realm still supplies is the record: the revealed seed, the
              hash that preceded it and the cards it says it dealt. The hash is
              what closes that gap, and it is why it is published before you act
              rather than after. Save the hash you were shown when you set your
              seed, paste it in above, and you are trusting nothing at all: a
              realm that swapped the seed afterwards fails the first check, in
              your browser, in front of you.
            </p>
            <p>
              A single draw is a single draw. Fairness across many is what the
              printed odds and the guaranteed floor on every chest are for, and
              both are on the Warchests page in writing.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
