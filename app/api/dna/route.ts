import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { fetchPortfolio } from "@/lib/market/goldrush";

/* The DNA Analyzer. A presale hype tool: paste an EVM address or an @handle
   and the intel engine reads a "DNA" profile from REAL data only. On-chain
   reads come from GoldRush (Covalent); social reads come from the platform's
   own public tables. Nothing is invented: when a source is empty we say so and
   let the model narrate honestly around the gap. */

/* Anthropic client init mirrors lib/ai/raven.ts: same env var, same model. */
const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
const DNA_MODEL = "claude-sonnet-5";

/* ---- Shared shapes returned to the client ---- */

type DataPoint = { label: string; value: string };

interface DnaResult {
  kind: "wallet" | "social";
  subject: string;
  archetype: string;
  traits: string[];
  narrative: string;
  dataPoints: DataPoint[];
  /* True when the real data sources came back empty, so the UI can be honest. */
  sparse: boolean;
  shareText: string;
}

/* What the model is asked to author. Real numbers are computed server-side and
   never delegated to the model, so the figures on the card are always true. */
interface DnaVoice {
  archetype: string;
  traits: string[];
  narrative: string;
}

const HOUSE_NAMES: Record<string, string> = {
  corvane: "House Corvane",
  emberfall: "House Emberfall",
  frosthold: "House Frosthold",
  goldmane: "House Goldmane",
  nightvale: "House Nightvale",
  stormcrest: "House Stormcrest",
};

function authHeader(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function valueBucket(total: number): string {
  if (total <= 0) return "empty";
  if (total < 1_000) return "under $1K";
  if (total < 10_000) return "$1K to $10K";
  if (total < 100_000) return "$10K to $100K";
  if (total < 1_000_000) return "$100K to $1M";
  return "seven figures and up";
}

/* ---- On-chain activity summary (cheap: one summary call on mainnet) ---- */

interface ActivitySummary {
  txCount: number | null;
  earliest: string | null;
  latest: string | null;
}

async function fetchActivity(
  key: string,
  address: string
): Promise<ActivitySummary | null> {
  try {
    const res = await fetch(
      `https://api.covalenthq.com/v1/eth-mainnet/address/${address}/transactions_summary/`,
      { headers: { Authorization: authHeader(key) }, next: { revalidate: 120 } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: {
        items?: Array<{
          total_count?: number | null;
          earliest_transaction?: { block_signed_at?: string | null } | null;
          latest_transaction?: { block_signed_at?: string | null } | null;
        }>;
      };
    };
    const it = body.data?.items?.[0];
    if (!it) return null;
    return {
      txCount: typeof it.total_count === "number" ? it.total_count : null,
      earliest: it.earliest_transaction?.block_signed_at ?? null,
      latest: it.latest_transaction?.block_signed_at ?? null,
    };
  } catch {
    return null;
  }
}

/* ---- Model call: authors archetype + traits + narrative only ---- */

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function parseVoice(raw: string): DnaVoice | null {
  let text = raw.trim();
  /* Strip a ```json fence if the model wrapped the object. */
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      archetype?: unknown;
      traits?: unknown;
      narrative?: unknown;
    };
    const archetype =
      typeof obj.archetype === "string" ? obj.archetype.trim() : "";
    const narrative =
      typeof obj.narrative === "string" ? obj.narrative.trim() : "";
    const traits = Array.isArray(obj.traits)
      ? obj.traits
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    if (!archetype || !narrative || traits.length === 0) return null;
    return { archetype, traits, narrative };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are the DNA Analyzer for THE RAVENSPIRE, an intelligence tool. You read a subject's REAL data and distill it into a short, striking "DNA" profile.

Voice: sharp, modern, confident market-intel analyst. Present tense. Think a top on-chain sleuth or a social analyst, not a fortune teller. This is NOT medieval or mystical. No roleplay, no "milord", no purple prose.

Hard rules:
- Use ONLY the facts given in the DATA block. Never invent a number, token, transaction, holding, follower count, or activity you were not handed.
- If the DATA says a source was empty or thin, acknowledge the subject is quiet or new rather than inventing a story.
- Never state or guess a private balance for a social handle.
- No em-dashes. No emojis. No hashtags.

Return ONLY a JSON object, no prose around it, shaped exactly:
{
  "archetype": "a punchy 2-4 word title, e.g. The Patient Whale, The Degen Sniper, The Realm Herald",
  "traits": ["3 to 5 short trait chips, 1-3 words each"],
  "narrative": "2-4 sentences of DNA read, grounded strictly in the DATA, in the analyst voice"
}`;

async function callModel(dataBlock: string): Promise<DnaVoice | null> {
  if (!anthropic) return null;
  try {
    const res = await anthropic.messages.create({
      model: DNA_MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `DATA:\n${dataBlock}\n\nReturn the DNA JSON now.`,
        },
      ],
    });
    return parseVoice(extractText(res.content));
  } catch {
    return null;
  }
}

/* ---- Wallet DNA ---- */

async function walletDna(address: string): Promise<DnaResult | Response> {
  const key = process.env.GOLDRUSH_API_KEY;
  if (!key)
    return json(
      {
        error:
          "On-chain sight is not configured in this environment, so wallet DNA cannot be read right now.",
      },
      503
    );

  const [portfolio, activity] = await Promise.all([
    fetchPortfolio(address),
    fetchActivity(key, address),
  ]);

  const items = portfolio?.items ?? [];
  const chains = portfolio?.allocations ?? [];
  const totalUsd = portfolio?.totalUsd ?? 0;
  const notable = items.slice(0, 5).map((it) => it.symbol);
  const chainNames = chains.map((c) => c.chainLabel);
  const sparse = items.length === 0 && (activity?.txCount ?? 0) === 0;

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  /* Real, server-computed data points. These are the numbers on the card. */
  const dataPoints: DataPoint[] = [];
  dataPoints.push({
    label: "Chains active",
    value: chainNames.length ? chainNames.join(", ") : "None seen",
  });
  dataPoints.push({
    label: "Holdings",
    value: items.length ? `${items.length} priced tokens` : "No priced tokens",
  });
  if (totalUsd > 0)
    dataPoints.push({ label: "Portfolio band", value: valueBucket(totalUsd) });
  if (notable.length)
    dataPoints.push({ label: "Notable tokens", value: notable.join(", ") });
  if (activity?.txCount != null)
    dataPoints.push({
      label: "Lifetime txns",
      value: activity.txCount.toLocaleString("en-US"),
    });
  if (activity?.earliest)
    dataPoints.push({
      label: "First seen",
      value: new Date(activity.earliest).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
      }),
    });

  /* Facts handed to the model. Value is bucketed, not exact, and holdings are
     described by symbol and rounded USD so the model never sees a raw balance
     it might mangle. */
  const factLines: string[] = [
    `Subject: EVM wallet ${short}`,
    chainNames.length
      ? `Active on: ${chainNames.join(", ")}`
      : "No balances found on the tracked chains.",
    items.length
      ? `Priced token positions: ${items.length}. Portfolio value band: ${valueBucket(totalUsd)} (${formatUsd(totalUsd)}).`
      : "Holds no priced tokens on the tracked chains right now.",
    items.length
      ? `Top holdings by value: ${items
          .slice(0, 6)
          .map((it) => `${it.symbol} ~${formatUsd(it.quoteUsd)}`)
          .join(", ")}`
      : "",
    activity?.txCount != null
      ? `Lifetime Ethereum transactions: ${activity.txCount.toLocaleString("en-US")}.`
      : "Transaction count not available.",
    activity?.earliest
      ? `First on-chain activity around ${new Date(activity.earliest).toISOString().slice(0, 10)}, most recent around ${activity.latest ? new Date(activity.latest).toISOString().slice(0, 10) : "unknown"}.`
      : "",
    sparse
      ? "This wallet looks fresh or dormant: little to no on-chain footprint. Read it as new or quiet, do not invent activity."
      : "",
  ].filter(Boolean);

  const voice = await callModel(factLines.join("\n"));
  const fallback: DnaVoice = sparse
    ? {
        archetype: "The Fresh Wallet",
        traits: ["New arrival", "Clean slate", "Unwritten"],
        narrative:
          "This address has barely touched the chain yet. No meaningful holdings, no trading history to read. A blank page, which is its own kind of signal: someone just getting started, or a vault kept deliberately quiet.",
      }
    : {
        archetype: "The On-Chain Operator",
        traits: chainNames.length
          ? [`${chainNames.length} chains`, "Active", "Diversified"]
          : ["On-chain", "Low profile"],
        narrative: `This wallet moves across ${chainNames.length || "the"} ${chainNames.length === 1 ? "chain" : "chains"} with ${items.length} live positions in the ${valueBucket(totalUsd)} band. A working portfolio, read straight from the ledger.`,
      };

  const v = voice ?? fallback;
  return {
    kind: "wallet",
    subject: short,
    archetype: v.archetype,
    traits: v.traits,
    narrative: v.narrative,
    dataPoints,
    sparse,
    shareText: `My THE RAVENSPIRE Wallet DNA: ${v.archetype} - ${v.traits.join(", ")}. Read yours in the DNA Analyzer.`,
  };
}

/* ---- Social DNA ---- */

interface ProfileRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  house_slug: string | null;
  tier: string | null;
  renown: number | null;
  is_verified: boolean | null;
  created_at: string | null;
}

interface PostRow {
  kind: string | null;
  body: string | null;
  cashtags: string[] | null;
  house_slug: string | null;
  like_count: number | null;
  reply_count: number | null;
  repost_count: number | null;
  created_at: string | null;
}

async function socialDna(handle: string): Promise<DnaResult | Response> {
  const db = adminClient();
  if (!db)
    return json(
      { error: "The archives are unavailable, so social DNA cannot be read." },
      503
    );

  const clean = handle.replace(/^@/, "").slice(0, 30);
  const { data: prof } = await db
    .from("profiles")
    .select(
      "id, handle, display_name, house_slug, tier, renown, is_verified, created_at"
    )
    .ilike("handle", clean)
    .maybeSingle();

  const profile = prof as ProfileRow | null;
  if (!profile)
    return json(
      {
        error: `No realm member with the handle @${clean} was found. Social DNA reads the platform's own public data only.`,
      },
      404
    );

  /* PUBLIC data only. No balance, no wallet, no private fields ever leave. */
  const [postsRes, tipsRes] = await Promise.all([
    db
      .from("posts")
      .select(
        "kind, body, cashtags, house_slug, like_count, reply_count, repost_count, created_at"
      )
      .eq("author_id", profile.id)
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("tips")
      .select("to_id, points")
      .eq("from_id", profile.id)
      .limit(200),
  ]);

  const posts = (postsRes.data ?? []) as PostRow[];
  const tips = (tipsRes.data ?? []) as Array<{
    to_id: string | null;
    points: number | null;
  }>;

  /* Aggregate cashtags. */
  const tagCounts = new Map<string, number>();
  for (const p of posts)
    for (const tag of p.cashtags ?? []) {
      const t = tag.toUpperCase();
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  /* Resolve tip recipients to handles (public). */
  const tipTargets = [...new Set(tips.map((t) => t.to_id).filter(Boolean))];
  let tipHandles: string[] = [];
  if (tipTargets.length) {
    const { data: recips } = await db
      .from("profiles")
      .select("id, handle")
      .in("id", tipTargets as string[]);
    const byId = new Map(
      (recips ?? []).map((r) => [r.id as string, r.handle as string | null])
    );
    const perTarget = new Map<string, number>();
    for (const t of tips) {
      const h = t.to_id ? byId.get(t.to_id) : null;
      if (h) perTarget.set(h, (perTarget.get(h) ?? 0) + 1);
    }
    tipHandles = [...perTarget.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([h]) => `@${h}`);
  }

  const tipsGiven = tips.length;
  const houseName = profile.house_slug
    ? HOUSE_NAMES[profile.house_slug] ?? profile.house_slug
    : null;
  const callPosts = posts.filter((p) => p.kind === "call").length;
  const totalEngagement = posts.reduce(
    (s, p) => s + (p.like_count ?? 0) + (p.reply_count ?? 0) + (p.repost_count ?? 0),
    0
  );
  const sparse = posts.length === 0;

  const dataPoints: DataPoint[] = [];
  dataPoints.push({
    label: "Posts",
    value: sparse ? "No public posts yet" : `${posts.length}`,
  });
  if (topTags.length)
    dataPoints.push({ label: "Top cashtags", value: topTags.join(", ") });
  if (houseName) dataPoints.push({ label: "House", value: houseName });
  if (tipsGiven > 0)
    dataPoints.push({
      label: "Tips given",
      value: `${tipsGiven}${tipHandles.length ? ` to ${tipHandles.join(", ")}` : ""}`,
    });
  if (callPosts > 0)
    dataPoints.push({ label: "Market calls", value: `${callPosts}` });
  if (typeof profile.renown === "number" && profile.renown > 0)
    dataPoints.push({ label: "Renown", value: `${profile.renown}` });

  const factLines: string[] = [
    `Subject: THE RAVENSPIRE member @${profile.handle ?? clean}${profile.display_name ? ` (${profile.display_name})` : ""}${profile.is_verified ? ", verified" : ""}.`,
    houseName ? `House: ${houseName}.` : "Not aligned with any House yet.",
    profile.tier ? `Membership tier: ${profile.tier}.` : "",
    sparse
      ? "Has posted nothing public yet. Read as new or quiet, do not invent posts."
      : `Public posts: ${posts.length}. Total public engagement across them: ${totalEngagement} (likes, replies, reposts).`,
    callPosts > 0 ? `Market calls posted: ${callPosts}.` : "",
    topTags.length
      ? `Most-used cashtags: ${topTags.join(", ")}.`
      : "Rarely tags specific tokens.",
    tipsGiven > 0
      ? `Has given ${tipsGiven} tips${tipHandles.length ? `, most often to ${tipHandles.join(", ")}` : ""}.`
      : "Has not tipped anyone yet.",
    typeof profile.renown === "number"
      ? `Renown score: ${profile.renown}.`
      : "",
    "Do not state or guess any private balance or wallet value for this member.",
  ].filter(Boolean);

  const voice = await callModel(factLines.join("\n"));
  const fallback: DnaVoice = sparse
    ? {
        archetype: "The Quiet Newcomer",
        traits: ["New voice", "Lurker", "Unwritten"],
        narrative: `@${profile.handle ?? clean} has joined the realm but has not spoken up yet. No posts, no calls, no tips on the record. A lurker for now, waiting to make a first move.`,
      }
    : {
        archetype: "The Realm Voice",
        traits: [
          houseName ? houseName.replace("House ", "") : "Independent",
          topTags.length ? "Cashtag caller" : "Generalist",
          callPosts > 0 ? "Makes calls" : "Commentator",
        ],
        narrative: `@${profile.handle ?? clean} runs ${posts.length} posts deep${houseName ? ` under ${houseName}` : ""}${topTags.length ? `, leaning on ${topTags.slice(0, 3).join(", ")}` : ""}. An active presence read straight from the feed.`,
      };

  const v = voice ?? fallback;
  return {
    kind: "social",
    subject: `@${profile.handle ?? clean}`,
    archetype: v.archetype,
    traits: v.traits,
    narrative: v.narrative,
    dataPoints,
    sparse,
    shareText: `My THE RAVENSPIRE Social DNA: ${v.archetype} - ${v.traits.join(", ")}. Read yours in the DNA Analyzer.`,
  };
}

/* ---- Route ---- */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@?[a-zA-Z0-9_]{1,30}$/;

export async function POST(req: Request) {
  if (!anthropic)
    return json(
      { error: "The DNA Analyzer is not configured in this environment." },
      503
    );

  /* Public presale tool: rate-limit by IP so the model spend stays sane. */
  const rl = await rateLimit(`dna:${clientIp(req)}`, 20, 3600);
  if (!rl.ok)
    return json(
      { error: "Too many reads for now. Try again within the hour." },
      429
    );

  const body = (await req.json().catch(() => null)) as { query?: unknown } | null;
  const raw = typeof body?.query === "string" ? body.query.trim() : "";
  if (!raw) return json({ error: "Enter a wallet address or an @handle." }, 400);

  const query = raw.slice(0, 60);

  if (ADDRESS_RE.test(query)) {
    const out = await walletDna(query);
    return out instanceof Response ? out : json(out);
  }

  if (HANDLE_RE.test(query)) {
    const out = await socialDna(query);
    return out instanceof Response ? out : json(out);
  }

  return json(
    {
      error:
        "That does not look like an EVM address (0x...) or an @handle. Check it and try again.",
    },
    400
  );
}
