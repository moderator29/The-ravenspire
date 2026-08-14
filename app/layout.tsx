import { siteUrl } from "@/lib/site";
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
  metadataBase: new URL(siteUrl()),
  title: {
    default: "The Ravenspire",
    template: "%s · The Ravenspire",
  },
  description:
    "A competitive realm where communities earn reputation through participation. Post, make Calls the realm can verify, swear to a House, and climb from Smallfolk to Monarch. Standing is earned, never bought.",
  /* NO `images` KEY IN EITHER BLOCK, AND THAT IS THE WHOLE POINT.
   *
   * Both used to name /game/lineup.png here, and between them they made every
   * generated share card in the product invisible. Next resolves file-based
   * metadata into a segment only when that segment's own metadata does not
   * already name an image, and both keys are inherited by every route below
   * this layout, so:
   *
   *   openGraph.images    beat app/opengraph-image.tsx, which has therefore
   *                       never once reached a crawler.
   *   twitter.images      beat all of them, everywhere. X is the realm's
   *                       primary distribution channel and every Keep, raven,
   *                       Call and safety report shared to it unfurled as the
   *                       same static champion lineup, cropped from 1306x295
   *                       into a 1.91:1 frame.
   *
   * With both keys gone, each segment's own opengraph-image.tsx resolves, and
   * Next's own post-processing fills twitter:image from it when no twitter
   * block names one. That is why there are no twitter-image.tsx files beside
   * the nine Open Graph routes: they would be nine identical re-exports of a
   * fallback the framework already applies.
   *
   * Do not reintroduce either key here. A static image named at the root is not
   * a default, it is an override, and it silently disables the entire feature.
   */
  openGraph: {
    title: "The Ravenspire",
    description:
      "Make the call. Earn your name. A competitive realm of Houses, Calls, Crests and Renown, where standing is earned through participation.",
    siteName: "The Ravenspire",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Ravenspire",
    /* THE SAME PITCH AS openGraph ABOVE, and that is the point of this edit.
       The two blocks described two different products: this one led with a
       safety scanner promise and the one above with a competitive realm. A
       stranger meets whichever their client happens to read, so the realm had
       two first impressions and no way to know which one it was making. */
    description:
      "Make the call. Earn your name. A competitive realm of Houses, Calls, Crests and Renown.",
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
