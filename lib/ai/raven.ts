import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { splitFollowUps } from "@/lib/ai/followups";
import {
  RAVEN_SYSTEM_PROMPT,
  resolveVoicePrompt,
  resolveLength,
  lengthGuidance,
  lengthMaxTokens,
  resolveLanguage,
  languageGuidance,
  type RavenVoice,
  type RavenLength,
  type RavenLanguage,
} from "@/lib/ai/raven-voice";

const key = process.env.ANTHROPIC_API_KEY;
const client = key ? new Anthropic({ apiKey: key }) : null;

/* The model behind the Herald. Sonnet 5 is the best quality-to-cost balance. */
const RAVEN_MODEL = "claude-sonnet-5";

export function ravenEnabled() {
  return Boolean(client);
}

export type RavenSource = { title: string; url: string };

/**
 * A Herald reply. `text` is the spoken answer. `browsed` is true when live web
 * search actually ran, and `sources` surfaces where it looked so the interface
 * can cite it. `browseRequested` records that browsing was asked for even if it
 * could not run (so callers can note it honestly).
 */
export type RavenResult = {
  text: string;
  browsed: boolean;
  browseRequested: boolean;
  /* True when the web tool was actually offered and the call succeeded (so the
     model COULD browse, whether or not it chose to). Only false when browsing
     genuinely failed and we fell back, that is the only time we tell the
     member browsing was unavailable. */
  browseAvailable: boolean;
  sources: RavenSource[];
  /* Follow-ups the Herald itself proposed, grounded in the answer it just
     gave. Empty when it offered none, which the caller treats as "show
     nothing" rather than falling back to a generic set. */
  suggestions: string[];
};

export type AskRavenOptions = {
  voice?: RavenVoice | string;
  browse?: boolean;
  length?: RavenLength | string;
  language?: RavenLanguage | string;
};

function buildSystem(context: string | undefined, opts: AskRavenOptions): string {
  const base = resolveVoicePrompt(opts.voice) ?? RAVEN_SYSTEM_PROMPT;
  const parts: string[] = [base];

  const lengthNote = lengthGuidance(resolveLength(opts.length));
  if (lengthNote) parts.push(`## Length\n\n${lengthNote}`);

  if (opts.browse) {
    parts.push(
      `## Live browsing is ON\n\nYou have a real web_search tool this turn, and the member turned it on deliberately. USE IT, actually call web_search, for anything that touches current or fast-moving facts: news, prices or figures you were not handed in context, dates, standings, live events, "latest", "today", "now", or any claim you are not fully certain of. Prefer searching over guessing. Run more than one search if the question has parts. Weave what you find into your own voice, state findings plainly, and make clear when something is fresh from the web. Do not paste raw links into the prose; the interface lists your sources beside the reply.`
    );
  }

  if (context) {
    parts.push(
      `## Live realm context (real, verified, safe to state)\nThe lines below were fetched from live sources moments ago. Cite these figures freely and name them only once. Do NOT invent any number that is absent here.\n\n${context}`
    );
  }

  /* Follow-ups, written by the Herald rather than assembled from templates.
   *
   * These used to be generated from the question's cashtags: ask about no
   * token and every member on the platform was offered the same three chips,
   * "What is $ETH doing today", "Settle a debate for me", "Which House suits
   * me best", regardless of what had just been discussed. They were decoration
   * that looked like intelligence.
   *
   * Emitted in the same call as the answer, so they cost no extra latency and
   * no second request, and they can reference what was actually said because
   * the model writing them is the model that just said it. The block is
   * stripped from the spoken text before it reaches the member. */
  parts.push(
    `## Follow-ups\n\nAfter your answer, always end your message with a block in exactly this form, and nothing after it:\n\n<<<FOLLOWUPS>>>\nfirst follow-up\nsecond follow-up\nthird follow-up\n\nRules for that block: exactly two or three lines, one per line, no numbering, no bullets, no quotes. Each must be a natural next thing THIS member would actually say next given what you just told them, written in their voice as if they were typing it, under about nine words. They must follow from the specific content of your answer, never generic prompts. If you named a token, a House, a Call, a champion or a feature, a good follow-up digs into that specific thing. Never offer a follow-up whose answer you already gave in full. Write them in the same language as your reply.`
  );

  /* Last, deliberately. The realm context above is written in English and the
     voice prompt is a wall of English, so a language instruction placed before
     either of them competes with several thousand words pulling the other way.
     Placed last it is the final thing read, and it is also directly beside the
     figures it tells the Herald not to convert. */
  parts.push(`## Language\n\n${languageGuidance(resolveLanguage(opts.language))}`);

  return parts.join("\n\n");
}

/** Web search tool definition (server-side, hosted by Anthropic). */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 5,
};

/** Pull spoken text out of a Messages response, joining interleaved blocks. */
function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Collect deduped web sources from any web_search tool result blocks. */
function extractSources(content: Anthropic.ContentBlock[]): RavenSource[] {
  const out: RavenSource[] = [];
  const seen = new Set<string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const results = block.content;
    if (!Array.isArray(results)) continue;
    for (const r of results) {
      if (r.type !== "web_search_result") continue;
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      out.push({ title: r.title || r.url, url: r.url });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

function didBrowse(content: Anthropic.ContentBlock[]): boolean {
  return content.some(
    (b) => b.type === "web_search_tool_result" || b.type === "server_tool_use"
  );
}

export async function askRaven(
  messages: { role: "user" | "assistant"; content: string }[],
  context?: string,
  opts: AskRavenOptions = {}
): Promise<RavenResult | null> {
  if (!client) return null;

  const system = buildSystem(context, opts);
  const max_tokens = lengthMaxTokens(resolveLength(opts.length));
  const wantsBrowse = Boolean(opts.browse);

  try {
    const res = await client.messages.create({
      model: RAVEN_MODEL,
      max_tokens,
      system,
      messages,
      ...(wantsBrowse ? { tools: [WEB_SEARCH_TOOL] } : {}),
    });
    const raw = extractText(res.content);
    if (!raw) return null;
    const { text, suggestions } = splitFollowUps(raw);
    if (!text) return null;
    return {
      text,
      browsed: wantsBrowse && didBrowse(res.content),
      browseRequested: wantsBrowse,
      browseAvailable: wantsBrowse,
      sources: wantsBrowse ? extractSources(res.content) : [],
      suggestions,
    };
  } catch (err) {
    // Graceful degradation: if browsing was requested and the call failed
    // (e.g. the tool is unavailable), retry once without the tool so the
    // member still gets an answer, and flag that browsing did not run.
    if (wantsBrowse) {
      try {
        const res = await client.messages.create({
          model: RAVEN_MODEL,
          max_tokens,
          system: buildSystem(context, { ...opts, browse: false }),
          messages,
        });
        const raw = extractText(res.content);
        if (!raw) return null;
        const { text, suggestions } = splitFollowUps(raw);
        if (!text) return null;
        return {
          text,
          browsed: false,
          browseRequested: true,
          browseAvailable: false,
          sources: [],
          suggestions,
        };
      } catch {
        return null;
      }
    }
    void err;
    return null;
  }
}
