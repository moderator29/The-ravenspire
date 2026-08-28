import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { tradeChainById } from "@/lib/trade/config";
import { notifyFollowers } from "@/lib/notifications";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { verifyTrade } from "@/lib/chain/verify-transfer";

/* The platform-wide trade feed. After a member's own wallet confirms an in-app
   buy, sell or swap (the on-chain transfer is the source of truth), the client
   posts the receipt here so the realm has a shared, real transaction feed
   alongside each member's Vault history. The platform never holds funds; this
   route only records what already happened on-chain.

   GET returns the recent realm feed (members only). Real data only: no seeded
   or invented trades ever, and, since the hardening pass, no UNVERIFIED ones
   either. The feed used to publish whatever hash a client posted, so a script
   could inject fabricated trades as social proof and fan a notification out to
   every follower of the account that posted them. The hash is now read off the
   chain before a trade reaches the feed: the transaction succeeded, it was sent
   by that member's own wallet, and where the trade names a coin it received,
   that coin moved into that wallet.

   WHAT THE FEED VOUCHES FOR, exactly. The verification above proves the
   transaction and the received token, and those are the only figures the feed
   serves: kind, chain, hash and symbols. The amounts and the USD value are
   client-supplied and unproven, so serving them under the feed's verified
   framing would launder a claim into a fact; those fields are returned as null
   until they are read off the chain too. The member's own Vault history still
   shows their own claimed figures, where they read as the member's claim.

   An unproven trade is still recorded and still shows in the member's own Vault
   history. It just does not enter the shared feed and rings nobody's ravens,
   because the thing being defended is the audience, not the record. */

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
      "id, kind, chain_id, tx_hash, sell_symbol, buy_symbol, buy_contract, created_at, trader:profiles!trades_profile_id_fkey (handle, display_name, avatar_url)"
    )
    /* Verified only. An unproven trade is a claim, and the realm feed is the
       one surface where a claim reads as a fact about somebody else. */
    .not("verified_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return json({ trades: [] });

  type Row = {
    id: string;
    kind: string;
    chain_id: number;
    tx_hash: string;
    sell_symbol: string | null;
    buy_symbol: string | null;
    buy_contract: string | null;
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
    buySymbol: t.buy_symbol,
    buyContract: t.buy_contract,
    /* Client-claimed figures, deliberately withheld: the feed's verification
       proves the transaction and the token, never these numbers, and a
       verified badge over an unproven figure is exactly the fabricated social
       proof the verification exists to end. Kept as nulls rather than removed
       so the client's shape is stable; they come back when they are read off
       the chain. */
    sellAmount: null,
    buyAmount: null,
    usdValue: null,
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

  /* Anti-automation. This route writes to the shared realm trade feed and fans a
     notification out to every one of the trader's followers, all off a
     client-supplied tx hash the server does not verify on-chain. Without a
     ceiling a script can inject fabricated trades as fake social proof and
     amplify notification spam across a whole follower list. A real trader records
     a handful an hour; this bounds abuse while never touching genuine use. Keyed
     on the account, consistent with every other mutating route. */
  const rl = await rateLimit(profileKey("trade_record", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      {
        error: "You trade faster than the ledger can be sealed. Rest a moment.",
        retryAfter: rl.retryAfter,
      },
      429
    );

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

  /* Read the chain. A trade with no wallet on file cannot be attributed to
     anyone, so it is unproven rather than refused: a member whose wallet has
     not synced yet has done nothing wrong. */
  const wallet = profile.wallet_address;
  let verifiedAt: string | null = null;
  if (wallet) {
    const verdict = await verifyTrade({
      chainId,
      txHash: txHash.toLowerCase() as `0x${string}`,
      from: wallet,
      /* A sell ends in the chain's own coin, which leaves no ERC-20 log to
         check, so only a buy or a swap names a token that must have arrived. */
      receivedToken: kind === "sell" ? null : cleanContract(body?.buyContract),
    });
    if (!verdict.verified && !verdict.pending) {
      return json({ error: verdict.reason }, 400);
    }
    if (verdict.verified) verifiedAt = new Date().toISOString();
  }

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
      verified_at: verifiedAt,
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

  /* Follow alert, for a verified trade only. The coin contract rides in ref so
     the raven opens the right coin page. An unproven trade fans out to nobody:
     a notification to every follower is exactly the amplification that made an
     unchecked hash worth forging. */
  if (!verifiedAt) {
    return json({ ok: true, trade: trade.id, verified: false });
  }

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

  return json({ ok: true, trade: trade.id, verified: true });
}
