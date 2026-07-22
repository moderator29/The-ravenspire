import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  RAVEN_SYSTEM_PROMPT,
  resolveVoicePrompt,
  resolveLength,
  lengthGuidance,
  lengthMaxTokens,
  type RavenVoice,
  type RavenLength,
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
  sources: RavenSource[];
};

export type AskRavenOptions = {
  voice?: RavenVoice | string;
  browse?: boolean;
  length?: RavenLength | string;
};

function buildSystem(context: string | undefined, opts: AskRavenOptions): string {
  const base = resolveVoicePrompt(opts.voice) ?? RAVEN_SYSTEM_PROMPT;
  const parts: string[] = [base];

  const lengthNote = lengthGuidance(resolveLength(opts.length));
  if (lengthNote) parts.push(`## Length\n\n${lengthNote}`);

  if (opts.browse) {
    parts.push(
      `## Live browsing is ON\n\nYou have a web search tool this turn. Use it when the answer depends on current or fast-moving facts (news, prices you were not handed, dates, live events). Weave what you find into your own voice, state findings plainly, and make clear when something is fresh from the web. Do not paste raw links into the prose; the interface lists your sources beside the reply.`
    );
  }

  if (context) {
    parts.push(
      `## Live realm context (real, verified, safe to state)\nThe lines below were fetched from live sources moments ago. Cite these figures freely and name them only once. Do NOT invent any number that is absent here.\n\n${context}`
    );
  }

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
    const text = extractText(res.content);
    if (!text) return null;
    return {
      text,
      browsed: wantsBrowse && didBrowse(res.content),
      browseRequested: wantsBrowse,
      sources: wantsBrowse ? extractSources(res.content) : [],
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
        const text = extractText(res.content);
        if (!text) return null;
        return { text, browsed: false, browseRequested: true, sources: [] };
      } catch {
        return null;
      }
    }
    void err;
    return null;
  }
}
