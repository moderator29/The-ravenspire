import { requireProfile, json } from "@/lib/auth/server";
import Anthropic from "@anthropic-ai/sdk";

/* Client setup and env var copied from lib/ai/raven.ts: the realm speaks to
   Anthropic through a single key, and stays silent when it is absent. */
const key = process.env.ANTHROPIC_API_KEY;
const client = key ? new Anthropic({ apiKey: key }) : null;

const COMPOSE_SYSTEM = `You write a single, ready-to-post message (a "raven") for a member of The Ravenspire, a social realm where six great Houses compete in games of wit, prediction, and glory. The member will post your words as their own, so write in first person as a sharp, warm member of the realm.

Rules:
- Return ONLY the post text. No preamble, no quotation marks around it, no options, no explanation.
- One raven, tight and postable. Aim for under 240 characters, never more than 500.
- Confident, clever, human. A little realm flavor (ravens, banners, Houses, halls, duels) is seasoning, never the whole meal. A normal, genuinely engaging post comes first.
- No em-dashes, ever. Use commas, periods, or parentheses instead.
- No emojis. No hashtags. Do not @mention specific people.
- Tasteful and kind. Tease the game, never a person's worth.
- The Ravenspire is a social game of wit, never gambling. Never give financial advice, never tell anyone to buy, sell, or hold, and never invent prices, percentages, or statistics.`;

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Finish onboarding first" }, 403);
  if (!client)
    return json({ error: "The rookery is quiet. Try again later." }, 503);

  const body = (await req.json().catch(() => null)) as {
    draft?: string;
  } | null;
  const draft = (body?.draft ?? "").slice(0, 500).trim();

  const houseLine = profile.house_slug
    ? `\n\nThe member is sworn to House ${profile.house_slug}. A light touch of their House's character is welcome, never forced.`
    : "";
  const userMsg = draft
    ? `The member is working from this draft. Polish it or build on it, keeping their intent and their voice:\n\n${draft}`
    : `The member has no draft yet. Offer one sharp, postable raven that opens a good conversation in the realm.`;

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: `${COMPOSE_SYSTEM}${houseLine}`,
      messages: [{ role: "user", content: userMsg }],
    });
    const block = res.content.find((b) => b.type === "text");
    /* Strip stray wrapping quotes and any em-dash that slipped through. */
    const text =
      block && block.type === "text"
        ? block.text.trim().replace(/^["']|["']$/g, "").replace(/\s*[—–]\s*/g, ", ").trim()
        : "";
    if (!text) return json({ error: "No words came. Try again." }, 502);
    return json({ ok: true, text });
  } catch {
    return json({ error: "The words would not come. Try again." }, 502);
  }
}
