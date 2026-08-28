import { requireProfile, json } from "@/lib/auth/server";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { MODEL_REASONING, heraldAvailable, heraldProse } from "@/lib/ai/herald";

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
  if (!heraldAvailable())
    return json({ error: "The rookery is quiet. Try again later." }, 503);

  /* C4: every call here is a paid Anthropic call and the composer can fire it
     on a keystroke. Metered per account, shared across instances, and failing
     closed: a limiter outage refuses rather than spending unmetered. */
  const rl = await rateLimit(profileKey("compose", profile.id), 40, 3600, {
    failClosed: true,
  });
  if (!rl.ok)
    return json(
      {
        error: "The quill needs rest. Try again within the hour.",
        retryAfter: rl.retryAfter,
      },
      429
    );

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

  /* Wrapping quotes and any em dash that slipped through are stripped by
     heraldProse, so every AI surface inherits house rule 1 rather than each
     one carrying its own copy of the filter. */
  const text = await heraldProse({
    model: MODEL_REASONING,
    system: `${COMPOSE_SYSTEM}${houseLine}`,
    user: userMsg,
    maxTokens: 300,
  });
  if (!text) return json({ error: "The words would not come. Try again." }, 502);
  return json({ ok: true, text });
}
