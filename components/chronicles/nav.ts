import type { Icon3DName } from "@/components/ui/icon-3d";

/* The Chronicles' own table of contents, declared once so the sidebar, the
   mobile rail and each page's prev/next footer can never disagree about what
   the book contains or what order it reads in. */

export interface ChronicleChapter {
  slug: string;
  href: string;
  icon: Icon3DName;
  kicker: string;
  title: string;
  dek: string;
}

export const chronicleChapters: ChronicleChapter[] = [
  {
    slug: "overview",
    href: "/chronicles",
    icon: "raven",
    kicker: "I",
    title: "The Realm",
    dek: "What this is, and the one idea underneath all of it.",
  },
  {
    slug: "system",
    href: "/chronicles/system",
    icon: "network",
    kicker: "II",
    title: "The System",
    dek: "How a Call, a House, a Herald and a Season are one machine.",
  },
  {
    slug: "philosophy",
    href: "/chronicles/philosophy",
    icon: "scales",
    kicker: "III",
    title: "The Principles",
    dek: "Why non-custodial, why real data only, and what that actually buys you.",
  },
  {
    slug: "economy",
    href: "/chronicles/economy",
    icon: "coins",
    kicker: "IV",
    title: "The Economy",
    dek: "$RSP, Season Zero, and how the realm intends to earn a living.",
  },
  {
    slug: "roadmap",
    href: "/chronicles/roadmap",
    icon: "compass",
    kicker: "V",
    title: "The Road Ahead",
    dek: "What is built, what is being built, and where this goes.",
  },
];
