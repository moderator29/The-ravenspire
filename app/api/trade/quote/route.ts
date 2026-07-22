import { requireProfile, json } from "@/lib/auth/server";
import { zeroxPrice, zeroxQuote, zeroxEnabled } from "@/lib/trade/zerox";
import { tradeChainById } from "@/lib/trade/config";

/* POST /api/trade/quote
   Body: { mode, chainId, sellToken, buyToken, sellAmount?, buyAmount?,
           taker?, slippageBps?, feeToken? }

   A members-only route so anonymous callers cannot burn the 0x quota. Returns
   the normalized quote (indicative price, or a firm quote with calldata). The
   member's own Privy wallet signs and broadcasts; this route never moves funds
   and never holds keys. */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
// The 0x native-token sentinel (0xEeee...) is also valid in token slots.
const NATIVE_RE = /^0x[eE]{40}$/;
const AMOUNT_RE = /^\d+$/; // base units only, no decimals

function validToken(v: unknown): v is string {
  return typeof v === "string" && (ADDRESS_RE.test(v) || NATIVE_RE.test(v));
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  if (!zeroxEnabled()) {
    return json(
      {
        error:
          "Live trading is warming up. The 0x route is not connected yet.",
        configured: false,
      },
      503
    );
  }

  const body = (await req.json().catch(() => null)) as {
    mode?: string;
    chainId?: number;
    sellToken?: string;
    buyToken?: string;
    sellAmount?: string;
    buyAmount?: string;
    taker?: string;
    slippageBps?: number;
    feeToken?: string;
  } | null;

  if (!body) return json({ error: "bad request" }, 400);

  const mode = body.mode === "quote" ? "quote" : "price";
  const chainId = Number(body.chainId);
  if (!Number.isFinite(chainId) || !tradeChainById(chainId)) {
    return json({ error: "This chain is not tradable. EVM chains only." }, 400);
  }
  if (!validToken(body.sellToken) || !validToken(body.buyToken)) {
    return json({ error: "A valid sell and buy token are required." }, 400);
  }
  const sellAmount = body.sellAmount?.trim();
  const buyAmount = body.buyAmount?.trim();
  const hasSell = !!sellAmount && AMOUNT_RE.test(sellAmount);
  const hasBuy = !!buyAmount && AMOUNT_RE.test(buyAmount);
  if (hasSell === hasBuy) {
    return json(
      { error: "Provide exactly one of sellAmount or buyAmount (base units)." },
      400
    );
  }
  // A firm quote needs the taker (the member's wallet) to build calldata.
  if (mode === "quote" && !validToken(body.taker)) {
    return json({ error: "A wallet address is required for a firm quote." }, 400);
  }
  const slippageBps =
    typeof body.slippageBps === "number" &&
    body.slippageBps >= 0 &&
    body.slippageBps <= 5000
      ? Math.round(body.slippageBps)
      : undefined;

  const params = {
    chainId,
    sellToken: body.sellToken,
    buyToken: body.buyToken,
    sellAmount: hasSell ? sellAmount : undefined,
    buyAmount: hasBuy ? buyAmount : undefined,
    taker: body.taker,
    slippageBps,
    feeToken: validToken(body.feeToken) ? body.feeToken : undefined,
  };

  const result =
    mode === "quote" ? await zeroxQuote(params) : await zeroxPrice(params);

  if (!result.ok) {
    return json({ error: result.error }, result.status);
  }
  return json({ quote: result.quote });
}
