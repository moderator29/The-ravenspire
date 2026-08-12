import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { InertBackground } from "@/components/shell/inert-background";
import "./globals.css";

/* Both faces are self hosted rather than pulled through next/font/google.
 *
 * The Google loader downloads the font at BUILD time, so a build that cannot
 * reach fonts.gstatic.com does not fall back, it fails: the generated CSS
 * module keeps a src pointing at an internal module that was never produced,
 * and the build dies on a module resolution error with no mention of the
 * network. CI went red on exactly that, on a commit that touched nothing but
 * images, while the same commit built clean locally and deployed clean.
 *
 * A build that can fail because a third party CDN is having a moment is not a
 * build. These are the same two files the loader would have fetched, the latin
 * subset of each variable face, committed at 74KB together. Nothing else
 * changes: the CSS variables, the weights and the swap behaviour are what they
 * were, and now nothing is fetched from Google at build time or at run time,
 * which is a privacy improvement for members as well.
 *
 * Both are variable fonts, so one file covers the whole weight range. Cinzel
 * and Inter are both under the SIL Open Font License, which permits this. */
const cinzel = localFont({
  src: "./fonts/cinzel-latin.woff2",
  variable: "--font-cinzel",
  weight: "400 700",
  style: "normal",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ravenspire.vercel.app"),
  title: {
    default: "The Ravenspire",
    template: "%s · The Ravenspire",
  },
  description:
    "A competitive realm where communities earn reputation through participation. Post, make Calls the realm can verify, swear to a House, and climb from Smallfolk to Monarch. Standing is earned, never bought.",
  openGraph: {
    title: "The Ravenspire",
    description:
      "Make the call. Earn your name. A competitive realm of Houses, Calls, Crests and Renown, where standing is earned through participation.",
    siteName: "The Ravenspire",
    images: [{ url: "/game/lineup.png", width: 1306, height: 295 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Ravenspire",
    description: "See every chain. Fear no rug. Rule your realm.",
    images: ["/game/lineup.png"],
  },
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Outside Providers on purpose: it watches `document.body` for the
            `aria-hidden` Base UI puts on the background while a dialog is
            open, so it must not be a descendant of anything that gets hidden.
            See the file for the measurement. */}
        <InertBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
