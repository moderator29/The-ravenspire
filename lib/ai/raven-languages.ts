/**
 * The Herald's reply language.
 *
 * This is a separate module from `raven-voice.ts` for one reason: that file is
 * `server-only`, because it carries the system prompts, and the settings sheet
 * that offers this choice is a client component. A client importing a
 * `server-only` module fails the build. So the list and its guidance live here,
 * which both sides may import, and `raven-voice.ts` re-exports them so the
 * server keeps a single door.
 *
 * The list and the instruction that acts on it stay in one file on purpose.
 * Split them and a language can be offered in the picker that the prompt never
 * names, which reads to a member as the setting being ignored.
 */

/**
 * "auto" is the default and is not a non-choice: it tells the Herald to answer
 * in whatever language the member wrote in, which is what a person expects
 * without ever opening settings. A named language pins the reply regardless of
 * what the member typed, which is what someone wants when they read one
 * language comfortably and type another badly.
 *
 * The list is deliberately short. Every entry is a language the model handles
 * well enough that a reply in it is genuinely useful, and offering one it
 * cannot answer properly in would be a promise the product cannot keep.
 */
export type RavenLanguage =
  | "auto"
  | "en"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "it"
  | "tr"
  | "ru"
  | "ar"
  | "hi"
  | "id"
  | "vi"
  | "zh"
  | "ja"
  | "ko";

/* Endonyms, because a member looking for their own language scans for the word
   they call it by, not the English name for it. */
export const RAVEN_LANGUAGES: readonly { id: RavenLanguage; label: string }[] = [
  { id: "auto", label: "Match my message" },
  { id: "en", label: "English" },
  { id: "es", label: "Espanol" },
  { id: "pt", label: "Portugues" },
  { id: "fr", label: "Francais" },
  { id: "de", label: "Deutsch" },
  { id: "it", label: "Italiano" },
  { id: "tr", label: "Turkce" },
  { id: "ru", label: "Русский" },
  { id: "ar", label: "العربية" },
  { id: "hi", label: "हिन्दी" },
  { id: "id", label: "Bahasa Indonesia" },
  { id: "vi", label: "Tieng Viet" },
  { id: "zh", label: "中文" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
];

/* The name the model is told to write in. English names here on purpose: the
   instruction is read by the model, not by the member, and an English name is
   the least ambiguous way to ask for a language. */
const LANGUAGE_NAMES: Record<Exclude<RavenLanguage, "auto">, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  tr: "Turkish",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  id: "Indonesian",
  vi: "Vietnamese",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
};

/** Anything unrecognised becomes "auto", so an unknown string from a request
    body cannot reach the prompt. */
export function resolveLanguage(
  language: string | undefined | null
): RavenLanguage {
  const known = RAVEN_LANGUAGES.some((l) => l.id === language);
  return known ? (language as RavenLanguage) : "auto";
}

/**
 * The instruction appended to the system prompt for a chosen language.
 *
 * Three things are pinned alongside the language itself, because each one is a
 * way a translated reply goes wrong:
 *
 * Realm proper nouns stay as they are. "House Frosthold" rendered as a literal
 * frost and hold in six languages stops being a name, and a member cannot then
 * find it anywhere else in the product.
 *
 * Figures stay exactly as given. A translated reply is still bound by the iron
 * rule, and converting a price into another currency would be inventing a
 * number the Herald was never handed.
 *
 * The voice survives the language. A Herald who is witty in English and flat
 * in Turkish is a different product for those members.
 */
export function languageGuidance(language: RavenLanguage): string {
  if (language === "auto") {
    return "Language: reply in the same language the member wrote to you in. If they switch languages, follow them.";
  }
  const name = LANGUAGE_NAMES[language];
  return `Language: write your entire reply in ${name}, whatever language the member writes to you in. Keep your voice, wit and warmth intact in ${name}; a flat translation of a sharp line is a worse reply, so write it fresh rather than translating word for word. Keep realm proper nouns in their original form (The Ravenspire, House Corvane, House Emberfall, House Frosthold, House Stormcrest, House Nightvale, House Goldmane, Glory, Renown, Calls, Crests, Keeps) because those are names, not words. Keep every figure, ticker and cashtag exactly as it was given to you, in the same currency and units. Never convert a price.`;
}
