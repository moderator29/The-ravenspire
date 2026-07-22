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
    "A medieval social realm where wit wins glory. Post, duel, swear to a House, play The War, and rule your realm. Fun first, standing earned, keys yours.",
  openGraph: {
    title: "The Ravenspire",
    description:
      "See every chain. Fear no rug. Rule your realm. Enter the social realm of Houses, Calls, crests and The War.",
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
