import { json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Live realm stats for the landing hero: real, public social proof. Just
   counts, no member data. Cached briefly so the hero stays snappy. Degrades to
   zeros (which the UI hides) when the database cannot be read. */

export const revalidate = 60;

export async function GET() {
  const db = adminClient();
  if (!db) return json({ members: 0, ravens: 0, trades: 0, houses: 0 });

  try {
    const [members, ravens, trades, houses] = await Promise.all([
      db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("onboarded", true),
      db
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("deleted", false),
      db.from("trades").select("id", { count: "exact", head: true }),
      db.from("houses").select("slug", { count: "exact", head: true }),
    ]);
    return json({
      members: members.count ?? 0,
      ravens: ravens.count ?? 0,
      trades: trades.count ?? 0,
      houses: houses.count ?? 0,
    });
  } catch {
    return json({ members: 0, ravens: 0, trades: 0, houses: 0 });
  }
}
