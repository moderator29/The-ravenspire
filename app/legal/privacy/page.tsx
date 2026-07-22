import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How The Ravenspire collects, uses, and protects your information across a non-custodial SocialFi realm. Your keys and funds are always your own.",
};

const EFFECTIVE_DATE = "July 19, 2026";

type Section = {
  id: string;
  heading: string;
  body: string[];
  list?: string[];
};

const sections: Section[] = [
  {
    id: "overview",
    heading: "1. Overview",
    body: [
      "The Ravenspire is a medieval-fantasy social realm built on non-custodial principles. This Privacy Policy explains what information we collect when you enter the realm, how we use it, and the choices you hold over it. By using The Ravenspire, you agree to the practices described here.",
      "We keep the surface small on purpose. We collect what is needed to run the realm and keep it safe, and little else.",
    ],
  },
  {
    id: "non-custodial",
    heading: "2. Non-custodial by design",
    body: [
      "The Ravenspire never holds your private keys or your funds. Wallets are provided through Privy embedded wallets, created for you on sign-up and controlled by you. You can export your keys at any time and take them anywhere.",
      "Because we are non-custodial, we cannot move, freeze, or recover your assets, and we never take custody of them. Every on-chain action is signed by you. We do not have access to your seed phrase or private keys, and we cannot see or transact on your behalf.",
    ],
  },
  {
    id: "data-we-collect",
    heading: "3. Information we collect",
    body: ["To operate the realm, we collect a limited set of information:"],
    list: [
      "Your X (Twitter) handle, used to establish your identity and presence in the realm.",
      "Your email address, used for account access, security notices, and important service messages.",
      "Your public wallet address, used to associate on-chain activity and rewards with your account.",
      "Your on-platform activity, such as posts, Calls, House membership, quests, duels, points, and other actions you take within The Ravenspire.",
      "Basic technical data, such as device and browser information and general logs, used to keep the service running and secure.",
    ],
  },
  {
    id: "how-we-use",
    heading: "4. How we use your information",
    body: [
      "We use the information we collect to provide and improve the realm, to authenticate you, to display your activity and standing, to calculate points and rewards, to communicate with you about your account, and to protect The Ravenspire and its members from abuse and fraud.",
      "We do not sell your personal information.",
    ],
  },
  {
    id: "storage",
    heading: "5. Where your data lives",
    body: [
      "Account and activity data is stored using Supabase, our database and backend provider. Wallet infrastructure is provided by Privy. These providers process data on our behalf under their own security and privacy commitments.",
      "Public blockchain activity is, by nature, public and permanent. Anything recorded on a public chain is outside our control and cannot be edited or deleted by us.",
    ],
  },
  {
    id: "sharing",
    heading: "6. Sharing and disclosure",
    body: [
      "We share information only with the service providers that help us run The Ravenspire, such as Privy and Supabase, and only to the extent needed for them to perform their function. We may disclose information if required by law, to enforce our terms, or to protect the rights, safety, and property of the realm and its members.",
    ],
  },
  {
    id: "your-choices",
    heading: "7. Your choices",
    body: [
      "You may access and update certain account details from within the realm. You can export your wallet keys at any time. You may request deletion of your account by contacting us, though information already published publicly, such as posts or on-chain activity, may persist beyond deletion of your account record.",
    ],
  },
  {
    id: "security",
    heading: "8. Security",
    body: [
      "We take reasonable measures to protect the information under our control. No system is perfectly secure, and you are responsible for safeguarding your own keys, devices, and login credentials. Because The Ravenspire is non-custodial, the security of your funds ultimately rests with you.",
    ],
  },
  {
    id: "eligibility",
    heading: "9. Children and eligibility",
    body: [
      "The Ravenspire is intended for adults. You must be at least 18 years of age, or the age of majority in your jurisdiction, to use the service. We do not knowingly collect information from anyone under this age.",
    ],
  },
  {
    id: "changes",
    heading: "10. Changes to this policy",
    body: [
      "We may update this Privacy Policy from time to time. When we do, we will revise the effective date above and, where appropriate, provide additional notice within the realm. Your continued use of The Ravenspire after changes take effect means you accept the updated policy.",
    ],
  },
  {
    id: "contact",
    heading: "11. Contact",
    body: [
      "If you have questions about this Privacy Policy or how your information is handled, reach us at privacy@ravenspire.xyz.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="realm-bg relative min-h-screen">
      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-bone-mut transition hover:text-gold"
        >
          Back to the realm
        </Link>

        <header className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">
            The realm keeps its word
          </p>
          <h1 className="gold-text mt-3 font-display text-4xl font-semibold tracking-[0.04em] sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-bone-faint">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </header>

        <article className="glass mt-8 p-7 sm:p-10">
          <div className="flex flex-col gap-8">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-8">
                <h2 className="font-display text-xl font-semibold text-bone sm:text-2xl">
                  {s.heading}
                </h2>
                <div className="mt-3 flex flex-col gap-3">
                  {s.body.map((p, i) => (
                    <p
                      key={i}
                      className="text-[15px] leading-relaxed text-bone-mut"
                    >
                      {p}
                    </p>
                  ))}
                </div>
                {s.list ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {s.list.map((item, i) => (
                      <li
                        key={i}
                        className="flex gap-3 text-[15px] leading-relaxed text-bone-mut"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>

        <footer className="mt-8 flex flex-col items-center gap-2 pb-6 text-center">
          <p className="text-xs uppercase tracking-[0.26em] text-bone-faint">
            Non-custodial by design. Your keys, your vault, always exportable.
          </p>
          <Link
            href="/legal/terms"
            className="text-sm font-medium text-gold transition hover:text-gold-bright"
          >
            Read the Terms of Service
          </Link>
        </footer>
      </div>
    </main>
  );
}
