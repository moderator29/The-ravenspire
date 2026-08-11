import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
