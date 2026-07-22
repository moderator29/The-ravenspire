import type { Holding, RealmPulse } from "@/components/raven/cards";

/* ---- Shared Raven chat types (owned surface) ---- */

export type TokenCard = {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  chain: string | null;
};

export type WalletCard = {
  address: string;
  totalUsd: number | null;
  holdings: Holding[];
};

export type Source = { title: string; url: string };

export type Msg = {
  role: "user" | "assistant" | "error";
  content: string;
  cards?: TokenCard[];
  walletCard?: WalletCard;
  pulse?: RealmPulse;
  suggestions?: string[];
  sources?: Source[];
  browsed?: boolean;
  browseRequested?: boolean;
};

/* ---- AI settings sent to /api/raven ---- */
export type Voice = "default" | "lore" | "normal" | "degen";
export type Length = "brief" | "normal" | "detailed";

export type RavenSettings = {
  voice: Voice;
  browse: boolean;
  length: Length;
};

export const VOICES: { id: Voice; label: string; hint: string }[] = [
  { id: "default", label: "Default", hint: "The realm Herald voice" },
  { id: "lore", label: "Lore", hint: "Deep, mythic worldbuilding" },
  { id: "normal", label: "Normal", hint: "Plain modern assistant" },
  { id: "degen", label: "Degen", hint: "Fast crypto-native alpha" },
];

export const LENGTHS: { id: Length; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "normal", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];

/* ---- Chat history (localStorage-backed) ---- */
export type Conversation = {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: number;
};

/* ---- localStorage keys ---- */
export const VOICE_KEY = "raven_voice";
export const BROWSE_KEY = "raven_browse";
export const LENGTH_KEY = "raven_length";
export const CONVOS_KEY = "raven_conversations";
export const ACTIVE_KEY = "raven_active_conversation";
