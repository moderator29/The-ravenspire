import "server-only";
import {
  PLATFORM_FEE_BPS,
  feeRecipient,
  tradeChainById,
  type TradeChain,
} from "./config";

/* The 0x Swap API (v2, allowance-holder flow) powers every in-app buy, sell
   and swap. We use allowance-holder rather than permit2 so the member's Privy
   embedded wallet can sign with a single sendTransaction (native buys need no
   approval; token sells need one ERC-20 approve to the allowance target),
   never a separate EIP-712 permit signature.

   Non-custodial: this server only fetches the quote and calldata. The wallet
   signs and broadcasts. The 0.5% platform fee is attached through 0x's own
   swapFee params so it is transparent and on-chain, and is simply omitted when
   no PLATFORM_FEE_RECIPIENT is configured (a missing env can never misroute).

   Real data only: when the 0x key is absent, or the API returns no liquidity,
   we say so honestly. Nothing here is fabricated. */

export function zeroxEnabled(): boolean {
  return Boolean(process.env.ZEROX_API_KEY);
}

export interface ZeroxParams {
  chainId: number;
  sellToken: string;
  buyToken: string;
  /* Exactly one of sellAmount / buyAmount, in base units (wei). */
  sellAmount?: string;
  buyAmount?: string;
  taker?: string;
  slippageBps?: number;
  /* Which side the 0.5% fee is taken in. 0x requires this to be the buyToken
     or the sellToken; we default to the buyToken. */
  feeToken?: string;
}

export interface NormalizedTx {
  to: string;
  data: string;
  value: string;
  gas: string | null;
}

export interface NormalizedQuote {
  liquidityAvailable: boolean;
  buyAmount: string | null;
  sellAmount: string | null;
  minBuyAmount: string | null;
  totalNetworkFee: string | null;
  gas: string | null;
  gasPrice: string | null;
  feeBps: number;
  feeAmount: string | null;
  feeToken: string | null;
  /* Sells need an ERC-20 approve to this spender before the swap tx. Null when
     no approval is required (native-token buys). */
  allowanceTarget: string | null;
  allowanceNeeded: boolean;
  balanceShortfall: boolean;
  /* Present only on a firm quote request. */
  transaction: NormalizedTx | null;
  chainId: number;
}

interface ZeroxRaw {
  liquidityAvailable?: boolean;
  buyAmount?: string;
  sellAmount?: string;
  minBuyAmount?: string;
  totalNetworkFee?: string;
  gas?: string;
  gasPrice?: string;
  transaction?: {
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
  };
  fees?: {
    integratorFee?: {
      amount?: string;
      token?: string;
    } | null;
  };
  issues?: {
    allowance?: { actual?: string; spender?: string } | null;
    balance?: { token?: string; actual?: string; expected?: string } | null;
  };
}

export type ZeroxResult =
  | { ok: true; quote: NormalizedQuote }
  | { ok: false; error: string; status: number };

function buildParams(
  kind: "price" | "quote",
  p: ZeroxParams,
  chain: TradeChain
): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("chainId", String(chain.id));
  qs.set("sellToken", p.sellToken);
  qs.set("buyToken", p.buyToken);
  if (p.sellAmount) qs.set("sellAmount", p.sellAmount);
  if (p.buyAmount) qs.set("buyAmount", p.buyAmount);
  if (p.taker) qs.set("taker", p.taker);
  qs.set("slippageBps", String(p.slippageBps ?? 100));

  // Attach the 0.5% platform fee only when a recipient is configured.
  const recipient = feeRecipient();
  if (recipient) {
    qs.set("swapFeeRecipient", recipient);
    qs.set("swapFeeBps", String(PLATFORM_FEE_BPS));
    qs.set("swapFeeToken", p.feeToken ?? p.buyToken);
  }
  void kind;
  return qs;
}

function normalize(raw: ZeroxRaw, chainId: number): NormalizedQuote {
  const allowance = raw.issues?.allowance ?? null;
  const balance = raw.issues?.balance ?? null;
  const recipient = feeRecipient();
  const integratorFee = raw.fees?.integratorFee ?? null;
  return {
    liquidityAvailable: raw.liquidityAvailable !== false,
    buyAmount: raw.buyAmount ?? null,
    sellAmount: raw.sellAmount ?? null,
    minBuyAmount: raw.minBuyAmount ?? null,
    totalNetworkFee: raw.totalNetworkFee ?? null,
    gas: raw.transaction?.gas ?? raw.gas ?? null,
    gasPrice: raw.transaction?.gasPrice ?? raw.gasPrice ?? null,
    feeBps: recipient ? PLATFORM_FEE_BPS : 0,
    feeAmount: integratorFee?.amount ?? null,
    feeToken: integratorFee?.token ?? null,
    // A non-null allowance issue with a spender means an approve is required.
    allowanceTarget: allowance?.spender ?? null,
    allowanceNeeded: Boolean(allowance && allowance.spender),
    balanceShortfall: Boolean(balance),
    transaction: raw.transaction?.to
      ? {
          to: raw.transaction.to,
          data: raw.transaction.data ?? "0x",
          value: raw.transaction.value ?? "0",
          gas: raw.transaction.gas ?? null,
        }
      : null,
    chainId,
  };
}

async function call(
  kind: "price" | "quote",
  p: ZeroxParams
): Promise<ZeroxResult> {
  const key = process.env.ZEROX_API_KEY;
  if (!key) {
    return {
      ok: false,
      status: 503,
      error:
        "Live trading is not configured yet. The 0x route is coming online shortly.",
    };
  }
  const chain = tradeChainById(p.chainId);
  if (!chain) {
    return { ok: false, status: 400, error: "This chain is not tradable." };
  }
  if (!p.sellAmount && !p.buyAmount) {
    return { ok: false, status: 400, error: "An amount is required." };
  }

  const url = `${chain.zeroxBase}/swap/allowance-holder/${kind}?${buildParams(kind, p, chain).toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        "0x-api-key": key,
        "0x-version": "v2",
        accept: "application/json",
      },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | (ZeroxRaw & { reason?: string; message?: string })
      | null;
    if (!res.ok) {
      const reason =
        body?.reason ||
        body?.message ||
        "The market could not be read right now.";
      return { ok: false, status: res.status, error: reason };
    }
    if (!body) {
      return { ok: false, status: 502, error: "Empty response from the market." };
    }
    const quote = normalize(body, chain.id);
    if (!quote.liquidityAvailable) {
      return {
        ok: false,
        status: 422,
        error: "No route with enough liquidity for this trade right now.",
      };
    }
    return { ok: true, quote };
  } catch {
    return {
      ok: false,
      status: 502,
      error: "The market could not be reached. Try again in a moment.",
    };
  }
}

/* Indicative price for live "you receive" figures as the member types. No
   taker required, cheaper on the 0x quota. */
export function zeroxPrice(p: ZeroxParams): Promise<ZeroxResult> {
  return call("price", p);
}

/* Firm quote with executable calldata. Requires a taker (the member's wallet).
   Returns the transaction the wallet signs and the allowance target for sells. */
export function zeroxQuote(p: ZeroxParams): Promise<ZeroxResult> {
  return call("quote", p);
}
