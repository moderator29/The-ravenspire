import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { fetchDexPricesBatch } from "@/lib/data/dex-price";
import { createNotification } from "@/lib/notifications";

/* GET /api/watchlist/alerts/check -> evaluate the member's own armed
   percent-move alerts against real, current prices, and file a real raven
   for any that crossed their band.

   SESSION-DRIVEN BY DESIGN, NOT A CRON. Every scheduled job in this repo
   (vercel.json's crons, app/api/cron/*) runs once a day, the finest grain the
   free Vercel tier allows, which is useless for a price alert. Rather than
   add a paid cron tier (rule 19: no new paid service, budget is zero), this
   route is polled by components/watchlist/alerts-poller.tsx on a short
   client interval while a member has the app open anywhere in the shell.
   That is a real, if coarser, alert: it fires within a few minutes of the
   member being in the app, and it is honest about not reaching someone who
   is not. Cheap for the member with nothing armed (the query below is a
   `select` on their own rows, limited by the partial index migration
   20260908122154 added), so the vast majority who never opt in cost nothing.

   RE-ARM RULE (see the migration for the full reasoning): a fired alert is
   rebased, not disarmed. alert_baseline_price becomes the price that just
   crossed the band and alert_pct stays armed, so the member keeps getting
   notified of the next X% move from wherever the coin is now, rather than
   the alert going quiet after doing its job once. */

const CHECK_LIMIT = 60;
const CHECK_WINDOW_SECONDS = 3600;

interface AlertRow {
  chain_id: number;
  address: string;
  alert_pct: number;
  alert_baseline_price: number;
}

interface Fired {
  chainId: number;
  address: string;
  symbol: string | null;
  movePct: number;
  priceUsd: number;
}

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* C4: paced by the poller's own 2 to 3 minute interval (see
     alerts-poller.tsx), which already bounds a single tab to roughly 20 to
     30 calls an hour. 60/hour leaves headroom for a member with the app open
     in more than one tab without opening the door to a script hammering this
     route, matching the sibling watchlist:read ceiling above it. */
  const rl = await rateLimit(
    profileKey("watchlist:alerts-check", profile.id),
    CHECK_LIMIT,
    CHECK_WINDOW_SECONDS
  );
  if (!rl.ok)
    return json(
      { error: "The glass has read enough this hour. Return shortly.", retryAfter: rl.retryAfter },
      429
    );

  const { data, error } = await db
    .from("watchlist_items")
    .select("chain_id, address, alert_pct, alert_baseline_price")
    .eq("profile_id", profile.id)
    .not("alert_pct", "is", null);
  if (error) return json({ checked: 0, fired: [] });

  const rows = (data ?? []) as AlertRow[];
  if (!rows.length) return json({ checked: 0, fired: [] });

  const prices = await fetchDexPricesBatch(
    rows.map((r) => ({ chainId: r.chain_id, address: r.address }))
  );

  const fired: Fired[] = [];
  const now = new Date().toISOString();

  await Promise.all(
    rows.map(async (row) => {
      const key = `${row.chain_id}:${row.address.toLowerCase()}`;
      const info = prices.get(key);
      /* No real price this poll (DexScreener miss, thin coverage): leave the
         alert exactly as it was and try again next poll. Never guess. */
      if (!info) return;

      const baseline = row.alert_baseline_price;
      if (!Number.isFinite(baseline) || baseline <= 0) return;
      const movePct = ((info.price - baseline) / baseline) * 100;
      if (Math.abs(movePct) < row.alert_pct) return;

      const up = movePct >= 0;
      const symbol = info.symbol ?? `${row.address.slice(0, 6)}…${row.address.slice(-4)}`;
      const body = `${symbol} moved ${up ? "+" : ""}${movePct.toFixed(2)}% since your alert was armed, now $${info.price}.`;

      await createNotification(db, {
        profile_id: profile.id,
        kind: "watch_alert",
        ref: row.address,
        body,
      });

      // Rebase, do not disarm (see the header comment for why).
      await db
        .from("watchlist_items")
        .update({
          alert_baseline_price: info.price,
          alert_fired_at: now,
        })
        .eq("profile_id", profile.id)
        .eq("chain_id", row.chain_id)
        .eq("address", row.address);

      fired.push({
        chainId: row.chain_id,
        address: row.address,
        symbol: info.symbol,
        movePct,
        priceUsd: info.price,
      });
    })
  );

  return json({ checked: rows.length, fired });
}
