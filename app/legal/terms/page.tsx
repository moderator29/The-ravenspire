import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of The Ravenspire, a non-custodial SocialFi realm. No financial advice, no securities offering, and standing earned rather than bought.",
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
    id: "acceptance",
    heading: "1. Acceptance of these terms",
    body: [
      "These Terms of Service govern your access to and use of The Ravenspire, a medieval-fantasy social realm and SocialFi platform. By entering the realm, creating an account, or using any part of the service, you agree to these terms. If you do not agree, do not use The Ravenspire.",
    ],
  },
  {
    id: "eligibility",
    heading: "2. Eligibility and age",
    body: [
      "You must be at least 18 years of age, or the age of majority in your jurisdiction, to use The Ravenspire. You are responsible for ensuring that your use of the service is lawful in your location. The Ravenspire may not be available where its use would be prohibited.",
    ],
  },
  {
    id: "accounts-wallets",
    heading: "3. Accounts and non-custodial wallets",
    body: [
      "When you join, a wallet is created for you through Privy embedded wallets. This wallet is yours. The Ravenspire is non-custodial and never holds your private keys or your funds. You can export your keys at any time and take them anywhere.",
      "You are solely responsible for safeguarding your keys, login credentials, and devices. Because we do not hold your keys, we cannot recover your account or your assets if access is lost, and we cannot reverse transactions you have signed.",
    ],
  },
  {
    id: "no-advice",
    heading: "4. No financial advice",
    body: [
      "The Ravenspire is a social realm first and a set of tools second. Nothing on the platform, including posts, Calls, market reads, or messages from @raven, is financial, investment, legal, or tax advice. Any figures shown are drawn from public data and are provided for information only.",
      "You are responsible for your own decisions. Digital assets carry significant risk, including the total loss of value. Do your own research and consider seeking advice from a qualified professional before acting.",
    ],
  },
  {
    id: "token",
    heading: "5. The $RSP token",
    body: [
      "$RSP is a utility and social token intended for use within the realm. It is not an investment product, and The Ravenspire does not offer it as a security. A presale is coming soon, and its terms will be announced openly when ready. Standing and rewards are earned through participation, never bought.",
      "Nothing in these terms or on the platform should be read as a promise of profit, price, or future value. You should not acquire or hold $RSP with the expectation of financial return.",
    ],
  },
  {
    id: "user-content",
    heading: "6. User-generated content",
    body: [
      "You are responsible for the content you post, including ravens, whispers, Calls, House activity, and any other material you contribute. You retain ownership of your content, and you grant The Ravenspire a license to host, display, and distribute it as needed to operate the service.",
      "You agree not to post content that is unlawful, infringing, deceptive, harassing, or otherwise harmful. We may remove content that violates these terms or that we reasonably consider harmful to the realm.",
    ],
  },
  {
    id: "prohibited",
    heading: "7. Prohibited conduct",
    body: ["When using The Ravenspire, you agree not to:"],
    list: [
      "Break any applicable law or regulation, or use the realm to facilitate unlawful activity.",
      "Manipulate markets, spread deliberate misinformation, or run scams, rugs, or fraudulent schemes.",
      "Impersonate others or misrepresent your identity or affiliation.",
      "Abuse, harass, threaten, or endanger other members of the realm.",
      "Attempt to disrupt, exploit, reverse engineer, or gain unauthorized access to the service or its systems.",
      "Use bots, scripts, or automation to game points, rewards, or standing.",
    ],
  },
  {
    id: "rewards",
    heading: "8. Points, rewards, and standing",
    body: [
      "Points, crests, Glory, and other measures of standing are features of the realm and hold no guaranteed monetary value. We may adjust how they are earned, calculated, or converted, and we may correct errors or reverse gains obtained through abuse or exploitation.",
    ],
  },
  {
    id: "third-parties",
    heading: "9. Third-party services",
    body: [
      "The Ravenspire relies on third-party providers, including Privy for wallet infrastructure and Supabase for data storage, and interacts with public blockchains. These services operate under their own terms, and we are not responsible for their performance, availability, or actions. On-chain activity is public and permanent by nature.",
    ],
  },
  {
    id: "disclaimers",
    heading: "10. Disclaimers and limitation of liability",
    body: [
      "The Ravenspire is provided on an as-is and as-available basis, without warranties of any kind, whether express or implied. We do not guarantee that the service will be uninterrupted, secure, or error-free.",
      "To the fullest extent permitted by law, The Ravenspire and its contributors will not be liable for any indirect, incidental, or consequential damages, or for any loss of assets, data, or profits arising from your use of the service.",
    ],
  },
  {
    id: "termination",
    heading: "11. Termination",
    body: [
      "You may stop using The Ravenspire at any time and export your keys. We may suspend or terminate your access if you violate these terms or act in a way that harms the realm or its members. Because the service is non-custodial, ending your access does not affect ownership of assets held in your own wallet.",
    ],
  },
  {
    id: "changes",
    heading: "12. Changes to these terms",
    body: [
      "We may update these terms from time to time. When we do, we will revise the effective date above and, where appropriate, provide additional notice within the realm. Your continued use of The Ravenspire after changes take effect means you accept the updated terms.",
    ],
  },
  {
    id: "contact",
    heading: "13. Contact",
    body: [
      "If you have questions about these terms, reach us at legal@ravenspire.xyz.",
    ],
  },
];

export default function TermsOfServicePage() {
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
            The terms of the realm
          </p>
          <h1 className="gold-text mt-3 font-display text-4xl font-semibold tracking-[0.04em] sm:text-5xl">
            Terms of Service
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
            Standing earned, never bought. Your keys, your vault, always yours.
          </p>
          <Link
            href="/legal/privacy"
            className="text-sm font-medium text-gold transition hover:text-gold-bright"
          >
            Read the Privacy Policy
          </Link>
        </footer>
      </div>
    </main>
  );
}
