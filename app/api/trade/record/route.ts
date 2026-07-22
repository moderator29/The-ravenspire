import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { tradeChainById } from "@/lib/trade/config";
import { notifyFollowers } from "@/lib/notifications";

/* The platform-wide trade feed. After a member's own wallet confirms an in-app
   buy, sell or swap (the on-chain transfer is the source of truth), the client
   posts the receipt here so the realm has a shared, real transaction feed
   alongside each member's Vault history. The platform never holds funds; this
   route only records what already happened on-chain.

   GET returns the recent realm feed (members only). Real data only: no seeded
   or invented trades ever. */

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SYMBOL_RE = /^[A-Za-z0-9.$+\-]{1,16}$/;
const AMOUNT_RE = /^\d*\.?\d+$/;
const KINDS = new Set(["buy", "sell", "swap"]);

function cleanSymbol(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return SYMBOL_RE.test(s) ? s : null;
}
function cleanAmount(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return AMOUNT_RE.test(s) ? s.slice(0, 40) : null;
}
function cleanContract(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return ADDRESS_RE.test(s) ? s : null;
}

/* GET /api/trade/record -> recent realm trades with the trader's public profile. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const limitRaw = Number(new URL(req.url).searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 30;

  const { data, error } = await db
    .from("trades")
    .select(
      "id, kind, chain_id, tx_hash, sell_symbol, sell_amount, buy_symbol, buy_amount, buy_contract, usd_value, created_at, trader:profiles!trades_profile_id_fkey (handle, display_name, avatar_url)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return json({ trades: [] });

  type Row = {
    id: string;
    kind: string;
    chain_id: number;
    tx_hash: string;
    sell_symbol: string | null;
    sell_amount: string | null;
    buy_symbol: string | null;
    buy_amount: string | null;
    buy_contract: string | null;
    usd_value: number | null;
    created_at: string;
    trader: {
      handle: string | null;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  };

  const trades = ((data ?? []) as unknown as Row[]).map((t) => ({
    id: t.id,
    kind: t.kind,
    chainId: t.chain_id,
    txHash: t.tx_hash,
    sellSymbol: t.sell_symbol,
    sellAmount: t.sell_amount,
    buySymbol: t.buy_symbol,
    buyAmount: t.buy_amount,
    buyContract: t.buy_contract,
    usdValue: t.usd_value,
    createdAt: t.created_at,
    trader: {
      handle: t.trader?.handle ?? null,
      displayName: t.trader?.display_name ?? null,
      avatarUrl: t.trader?.avatar_url ?? null,
    },
  }));

  return json({ trades });
}

/* POST /api/trade/record -> record a confirmed in-app trade.
   Body: { kind, chainId, txHash, sellSymbol, sellAmount, sellContract,
           buySymbol, buyAmount, buyContract, usdValue } */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const body = (await req.json().catch(() => null)) as {
    kind?: string;
    chainId?: number;
    txHash?: string;
    sellSymbol?: string;
    sellAmount?: string;
    sellContract?: string;
    buySymbol?: string;
    buyAmount?: string;
    buyContract?: string;
    usdValue?: number;
  } | null;

  const kind = body?.kind;
  const chainId = Number(body?.chainId);
  const txHash = body?.txHash?.trim();

  if (!kind || !KINDS.has(kind)) return json({ error: "bad kind" }, 400);
  if (!Number.isFinite(chainId) || !tradeChainById(chainId))
    return json({ error: "This chain is not tradable." }, 400);
  if (!txHash || !TX_HASH_RE.test(txHash))
    return json({ error: "bad transaction hash" }, 400);

  // Idempotent on the tx hash: a double-submit resolves to the existing row.
  const { data: prior } = await db
    .from("trades")
    .select("id")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (prior) return json({ ok: true, trade: prior.id, deduped: true });

  const usdValue =
    typeof body?.usdValue === "number" && Number.isFinite(body.usdValue)
      ? Math.max(0, body.usdValue)
      : null;

  const { data: trade, error } = await db
    .from("trades")
    .insert({
      profile_id: profile.id,
      kind,
      chain_id: chainId,
      tx_hash: txHash,
      sell_symbol: cleanSymbol(body?.sellSymbol),
      sell_amount: cleanAmount(body?.sellAmount),
      sell_contract: cleanContract(body?.sellContract),
      buy_symbol: cleanSymbol(body?.buySymbol),
      buy_amount: cleanAmount(body?.buyAmount),
      buy_contract: cleanContract(body?.buyContract),
      usd_value: usdValue,
    })
    .select("id")
    .single();

  if (error || !trade) {
    // Concurrent insert of the same hash trips the unique index; resolve to it.
    const { data: raced } = await db
      .from("trades")
      .select("id")
      .eq("tx_hash", txHash)
      .maybeSingle();
    if (raced) return json({ ok: true, trade: raced.id, deduped: true });
    return json({ error: "Could not record the trade" }, 500);
  }

  // Follow alert: tell the trader's followers about the move. The coin contract
  // rides in ref so the raven opens the right coin page.
  const buySym = cleanSymbol(body?.buySymbol);
  const sellSym = cleanSymbol(body?.sellSymbol);
  const buyAmt = cleanAmount(body?.buyAmount);
  const sellAmt = cleanAmount(body?.sellAmount);
  const alertBody =
    kind === "buy"
      ? `bought ${buyAmt ? `${buyAmt} ` : ""}${buySym ?? "a coin"}`
      : kind === "sell"
        ? `sold ${sellAmt ? `${sellAmt} ` : ""}${sellSym ?? "a coin"}`
        : `swapped ${sellSym ?? "a coin"} for ${buySym ?? "a coin"}`;
  const coinRef =
    kind === "sell" ? cleanContract(body?.sellContract) : cleanContract(body?.buyContract);
  await notifyFollowers(db, {
    actorId: profile.id,
    kind: "follow_trade",
    body: alertBody,
    ref: coinRef,
  });

  return json({ ok: true, trade: trade.id });
}
