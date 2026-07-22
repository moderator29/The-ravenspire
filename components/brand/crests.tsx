import type { ReactNode } from "react";

export type CrestStatus = "live" | "locked";
export type CrestRarity = "rare" | "epic" | "legendary" | "mythic";

export interface CrestDef {
  slug: string;
  name: string;
  plain: string;
  rarity: CrestRarity;
  status: CrestStatus;
  earn: string;
  icon: string;
}

export const crests: CrestDef[] = [
  { slug: "took-the-black", name: "Took the Black", plain: "Recruit", rarity: "rare", status: "live", earn: "Finish onboarding: handle, avatar, join a House, first raven, verify via X or wallet.", icon: "feather" },
  { slug: "knight-of-the-realm", name: "Knight of the Realm", plain: "Knight", rarity: "rare", status: "live", earn: "Reach a Renown threshold, win 3 duels, refer 3 active members, or hold a 7 day streak.", icon: "crossed-swords" },
  { slug: "warden-of-the-realm", name: "Warden of the Realm", plain: "Warden", rarity: "epic", status: "live", earn: "Top-tier Renown, lead a top House, or finish a Season high on the leaderboard.", icon: "tower-crown" },
  { slug: "blood-of-the-dragon", name: "Blood of the Dragon", plain: "Dragonlord", rarity: "mythic", status: "locked", earn: "Legendary status reserved for the realm's rarest achievers.", icon: "dragon-wing" },
  { slug: "hand-of-the-king", name: "Hand of the King", plain: "Top contributor", rarity: "legendary", status: "locked", earn: "For the realm's greatest contributors and stewards.", icon: "hand" },
  { slug: "master-of-whispers", name: "Master of Whispers", plain: "Best creators", rarity: "epic", status: "locked", earn: "For the sharpest and most loved creators of the Ravenry.", icon: "crest-eye" },
  { slug: "lord-of-light", name: "Lord of Light", plain: "Devotion streak", rarity: "rare", status: "locked", earn: "For unbroken daily devotion to the realm.", icon: "flame-drop" },
  { slug: "bannerlord", name: "Bannerlord", plain: "Top referrers", rarity: "epic", status: "locked", earn: "For those who raise the most banners and bring the realm to life.", icon: "banner-crest" },
  { slug: "keeper-of-the-vault", name: "Keeper of the Vault", plain: "Long-term staker", rarity: "legendary", status: "locked", earn: "For oaths sworn long in The Forge.", icon: "key" },
  { slug: "champion-of-the-season", name: "Champion of the Season", plain: "Season winner", rarity: "legendary", status: "locked", earn: "For those who stood highest when the Season closed.", icon: "laurel" },
];

const crestIcons: Record<string, ReactNode> = {
  feather: (
    <path d="M32 12c-8 2-14 10-14 22 0 4 .8 7 2 9l-4 7h4l3-5c2 1 4 1.5 6 1 8-2 10-14 10-22 0-6-3-10-7-12zM22 36c4-6 8-10 12-13" />
  ),
  "crossed-swords": (
    <>
      <path d="M16 14l22 22M48 14L26 36" />
      <path d="M18 42l-4 4m4-4l3 3m-3-3l-3-3M46 42l4 4m-4-4l-3 3m3-3l3-3" />
    </>
  ),
  "tower-crown": (
    <>
      <path d="M24 50V26h16v24M24 26v-6h4v4h4v-4h4v4h4v-4h4v6" />
      <path d="M20 50h24M28 40h8v10h-8z" />
    </>
  ),
  "dragon-wing": (
    <path d="M14 40C20 24 34 14 50 14c-6 4-8 8-8 12 6-2 10-2 14 0-6 2-10 6-12 10 4 0 8 2 10 4-10 4-28 6-40 0z" />
  ),
  hand: (
    <path d="M26 50V26c0-2 3-2 3 0v-8c0-2 3-2 3 0v-4c0-2 3-2 3 0v4c0-2 3-2 3 0v14l4-6c1.5-2 4 0 3 2l-6 14c-2 5-4 8-13 8z" />
  ),
  "crest-eye": (
    <>
      <path d="M12 32s7-11 20-11 20 11 20 11-7 11-20 11-20-11-20-11z" />
      <circle cx="32" cy="32" r="5" />
    </>
  ),
  "flame-drop": (
    <path d="M32 12c2 8-8 12-8 22a8 8 0 0016 0c0-3-1-5-3-8 .5 5-2.5 7-2.5 7 1.5-8-1.5-15-2.5-21z" />
  ),
  "banner-crest": <path d="M22 12h20v36l-10-7-10 7V12z" />,
  key: (
    <>
      <circle cx="26" cy="26" r="8" />
      <path d="M31 31l14 14m-6-2l4-4m-9-1l3-3" />
    </>
  ),
  laurel: (
    <>
      <path d="M20 16c-4 10-4 20 4 28m20-28c4 10 4 20-4 28" />
      <path d="M22 24c-3 1-5 0-7-2 2-2 5-2 7 2zm20 0c3 1 5 0 7-2-2-2-5-2-7 2zM20 34c-3 0-5-1-6-4 3-1 5 0 6 4zm24 0c3 0 5-1 6-4-3-1-5 0-6 4z" />
    </>
  ),
};

let seq = 0;

/* A forged-gold heraldic roundel. dim=true renders the locked look. */
export function CrestRoundel({
  icon,
  className = "h-20 w-20",
  dim = false,
}: {
  icon: string;
  className?: string;
  dim?: boolean;
}) {
  const id = `crest-gold-${seq++}`;
  const stroke = dim ? "rgba(200,162,76,0.45)" : `url(#${id})`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0D68C" />
          <stop offset="50%" stopColor="#C8A24C" />
          <stop offset="100%" stopColor="#8A6A2C" />
        </linearGradient>
      </defs>
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <circle
        cx="32"
        cy="32"
        r="25.5"
        fill="none"
        stroke={stroke}
        strokeWidth="0.8"
        opacity="0.6"
      />
      <g
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {crestIcons[icon] ?? <circle cx="32" cy="32" r="10" />}
      </g>
    </svg>
  );
}

export function findCrest(slug: string) {
  return crests.find((c) => c.slug === slug);
}
