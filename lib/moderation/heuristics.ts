/* Spam and toxicity, the free way first (V2 section 10, the two rows reading
   "free for the common cases with heuristics; model only on the uncertain tail.
   Build the heuristic first").

   Two claims are worth making explicitly, because both are why this file has no
   Anthropic import in it:

   1. The common cases are not subtle. A raven that is four links, nine
      cashtags and the words "guaranteed 1000x, DM me on telegram" is not a
      judgment call, it is a pattern, and a pattern is a regular expression.
      Paying a model to read it would be paying for an opinion about something
      that is already certain, on every single post, forever.
   2. What a heuristic must never do is decide. Nothing here deletes, hides or
      refuses anything. The realm files a flag for the moderators and a person
      makes the call, which is the only honest thing to do with a rule that
      cannot read intent. A member who trips a threshold still gets published.

   The uncertain tail, which is where a model genuinely earns its cost, is
   deliberately not built here. It is the next step and it belongs behind the
   same spend caps every other paid surface has.

   Pure, dependency free and testable. Nothing here reads a database, so the two
   signals that need one (how often this member has posted the same words, and
   how new the account is) arrive as arguments. */

export interface ScreenInput {
  text: string;
  /* Mentions and cashtags as the composer already extracted them, so this
     agrees with what was stored rather than re-parsing the body. */
  mentions?: number;
  cashtags?: number;
  /* How many times this member has posted this exact text lately. One is the
     post itself. Anything above one is repetition, which is the single
     strongest free spam signal there is. */
  repeats?: number;
}

export interface ScreenVerdict {
  /* Both in [0, 1]. They are weights over signals that fired, not
     probabilities, and nothing in the product treats them as probabilities. */
  spam: number;
  toxicity: number;
  /* Every signal that fired, by name, so a moderator reading the queue sees
     why the realm raised the flag rather than a bare score. */
  signals: string[];
  /* Two outcomes only. There is deliberately no "refuse": a heuristic that
     cannot read intent must not be allowed to silence a member. */
  action: "allow" | "flag";
}

/* Where a flag is raised. Tuned to be quiet: a false flag costs a moderator's
   attention, which is the scarcest thing in the realm. */
export const FLAG_AT = 0.6;

const URL_RE = /https?:\/\/[^\s]+/gi;

/* Phrases that are not a judgment call in a realm about predictions. Each one
   is a solicitation to leave the platform, a promise of a return, or both. */
const BAIT = [
  /\bdm\s+me\b/i,
  /\bt\.me\/|\btelegram\b|\bwhatsapp\b/i,
  /\bguaranteed\b.{0,20}\b(profit|return|gain|win)/i,
  /\b\d{3,}\s*x\b/i,
  /\bfree\s+(mint|airdrop|nft|tokens?)\b/i,
  /\bclick\s+(here|the\s+link)\b/i,
  /\bpump\s+(it|this)\b.{0,20}\bnow\b/i,
  /\bsend\s+(me\s+)?(your\s+)?(seed|private\s+key|wallet)\b/i,
];

/* Abuse that is unambiguous in any context: a threat, or an instruction to
   self harm. This list is deliberately short and deliberately not a word list.
   A list of words cannot tell an insult from a quotation from a reclaimed term,
   and pretending otherwise produces a moderation queue full of innocent people.
   Everything subtler than this is the uncertain tail, and the uncertain tail is
   where a model is worth paying for. */
const ABUSE = [
  /\bkill\s+your\s?self\b|\bkys\b/i,
  /\b(i|we)\s+(will|'ll|am going to)\s+(find|hurt|kill|end)\s+(you|u)\b/i,
  /\byou\s+should\s+(die|kill\s+your\s?self)\b/i,
  /\bhope\s+you\s+die\b/i,
];

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

export function screen(input: ScreenInput): ScreenVerdict {
  const text = (input.text ?? "").trim();
  const signals: string[] = [];
  let spam = 0;
  let toxicity = 0;

  const words = text.split(/\s+/).filter(Boolean);
  const links = text.match(URL_RE) ?? [];
  const mentions = input.mentions ?? 0;
  const cashtags = input.cashtags ?? 0;
  const repeats = input.repeats ?? 1;

  /* Repetition. A member posting the same words for the third time is the
     clearest free signal in the set, and it needs no reading of the words. */
  if (repeats >= 3) {
    spam += 0.6;
    signals.push(`repeated ${repeats} times`);
  } else if (repeats === 2) {
    spam += 0.25;
    signals.push("posted twice");
  }

  /* A body that is mostly links is an advertisement, whatever it says, and a
     body that is nothing but links is one twice over. Graded rather than
     exclusive, so a post citing four real sources inside real prose stays well
     under the line while a bare wall of links goes over it. */
  if (links.length >= 2 && ratio(links.length, Math.max(words.length, 1)) > 0.25) {
    spam += 0.45;
    signals.push(`${links.length} links in ${words.length} words`);
  }
  if (links.length >= 4) {
    spam += 0.2;
    signals.push(`${links.length} links`);
  }

  if (mentions >= 8) {
    spam += 0.4;
    signals.push(`${mentions} mentions`);
  } else if (mentions >= 5) {
    spam += 0.2;
    signals.push(`${mentions} mentions`);
  }

  if (cashtags >= 8) {
    spam += 0.35;
    signals.push(`${cashtags} cashtags`);
  }

  /* Solicitation, counted rather than detected. One phrase is a member saying
     "DM me" to a friend. Three of them stacked in one raven is a pitch, and the
     difference between those two is the count, not the words. */
  const bait = BAIT.filter((pattern) => pattern.test(text)).length;
  if (bait > 0) {
    spam += 0.25 * Math.min(bait, 3);
    signals.push(
      bait === 1 ? "solicitation phrasing" : `solicitation phrasing x${bait}`
    );
  }

  /* Shouting, but only where it is really shouting: a long body in capitals.
     A short all caps reply is emphasis and the realm is not a library. */
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 40 && ratio((text.match(/[A-Z]/g) ?? []).length, letters.length) > 0.7) {
    spam += 0.2;
    signals.push("shouting");
  }

  /* The same word over and over, which is what a filler post looks like once
     the links are stripped out of it. */
  if (words.length >= 8) {
    const counts = new Map<string, number>();
    for (const word of words) {
      const w = word.toLowerCase().replace(/[^a-z0-9$@]/g, "");
      if (w.length < 2) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    const top = Math.max(0, ...counts.values());
    if (ratio(top, words.length) > 0.4) {
      spam += 0.3;
      signals.push("one word repeated");
    }
  }

  for (const pattern of ABUSE) {
    if (pattern.test(text)) {
      toxicity += 0.95;
      signals.push("threat or self harm instruction");
      break;
    }
  }

  spam = Math.min(1, spam);
  toxicity = Math.min(1, toxicity);

  return {
    spam,
    toxicity,
    signals,
    action: spam >= FLAG_AT || toxicity >= FLAG_AT ? "flag" : "allow",
  };
}

/* The reason line a moderator reads in the queue. Every number in it is one the
   screen actually measured. */
export function flagReason(verdict: ScreenVerdict): string {
  const kind = verdict.toxicity >= FLAG_AT ? "abuse" : "spam";
  return `Raised by the realm: ${kind} heuristics fired (${verdict.signals.join(", ")}). Scores: spam ${verdict.spam.toFixed(2)}, abuse ${verdict.toxicity.toFixed(2)}. Nothing was hidden or removed.`;
}
