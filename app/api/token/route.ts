import { json } from "@/lib/auth/server";
import { lookupToken } from "@/lib/data/tokens";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q");
  if (!q) return json({ error: "missing q" }, 400);
  const card = await lookupToken(q);
  return json({ card });
}
