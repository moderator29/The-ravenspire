import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

type SettingsBucket = Record<string, unknown>;

interface SettingsBody {
  privacy?: SettingsBucket;
  notifications?: SettingsBucket;
  appearance?: SettingsBucket;
  voice?: SettingsBucket;
  profile?: SettingsBucket;
}

/* The settings buckets we accept and deep-merge into profiles.settings. Adding
   a bucket here is all it takes for a new group of preferences to persist.
   "profile" holds member-set profile extras such as the shareable thesis line. */
const BUCKETS = ["privacy", "notifications", "appearance", "voice", "profile"] as const;

const isBucket = (v: unknown): v is SettingsBucket =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data } = await db
    .from("profiles")
    .select("settings")
    .eq("id", profile.id)
    .single();

  return json({ settings: data?.settings ?? {} });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  let body: SettingsBody;
  try {
    body = (await req.json()) as SettingsBody;
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const { data: current } = await db
    .from("profiles")
    .select("settings")
    .eq("id", profile.id)
    .single();

  const existing = isBucket(current?.settings) ? current.settings : {};
  const merged: SettingsBucket = { ...existing };

  for (const key of BUCKETS) {
    const incoming = body[key];
    if (isBucket(incoming)) {
      const prev = isBucket(merged[key]) ? (merged[key] as SettingsBucket) : {};
      merged[key] = { ...prev, ...incoming };
    }
  }

  const { error } = await db
    .from("profiles")
    .update({ settings: merged })
    .eq("id", profile.id);
  if (error) return json({ error: "could not save" }, 500);

  return json({ settings: merged });
}
