import { requireProfile, json } from "@/lib/auth/server";

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  return json({ profile });
}
