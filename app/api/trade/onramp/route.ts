import crypto from "node:crypto";
import { requireProfile, json } from "@/lib/auth/server";
import { tradeChainById } from "@/lib/trade/config";

/* "Top up with card": a real MoonPay on-ramp URL so a member can buy the gas /
   quote token they need to trade. Non-custodial: MoonPay delivers straight to
   the member's own wallet address. The widget URL is signed server-side with
   the MoonPay secret so it cannot be tampered with. When MoonPay is not
   configured we say so honestly rather than opening a dead widget. */

/* EIP-155 chain id -> MoonPay native-currency code. Only the EVM chains we
   trade on. */
const MOONPAY_NATIVE: Record<number, string> = {
  1: "eth",
  8453: "eth_base",
  42161: "eth_arbitrum",
  10: "eth_optimism",
  56: "bnb_bsc",
  137: "matic_polygon",
  43114: "avax_cchain",
};

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const apiKey = process.env.NEXT_PUBLIC_MOONPAY_KEY;
  if (!apiKey) {
    return json(
      {
        configured: false,
        error: "Card top-up is warming up. The on-ramp is not connected yet.",
      },
      503
    );
  }

  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chainId"));
  const walletAddress = (url.searchParams.get("walletAddress") ?? "").trim();
  const amountUsd = url.searchParams.get("amountUsd");

  const chain = tradeChainById(chainId);
  if (!chain) return json({ error: "This chain is not tradable." }, 400);
  if (!ADDRESS_RE.test(walletAddress)) {
    return json({ error: "A valid wallet address is required." }, 400);
  }
  const currencyCode = MOONPAY_NATIVE[chainId];
  if (!currencyCode) {
    return json({ error: "No card route for this chain yet." }, 400);
  }

  const params = new URLSearchParams();
  params.set("apiKey", apiKey);
  params.set("currencyCode", currencyCode);
  params.set("walletAddress", walletAddress);
  params.set("baseCurrencyCode", "usd");
  if (amountUsd && /^\d{1,6}(\.\d{1,2})?$/.test(amountUsd)) {
    params.set("baseCurrencyAmount", amountUsd);
  }

  const query = params.toString();
  const base = "https://buy.moonpay.com";

  // Sign when the secret is present; MoonPay accepts unsigned URLs for test
  // keys but production requires the signature over the query string.
  const secret = process.env.MOONPAY_SECRET_KEY;
  let signed = `${base}?${query}`;
  if (secret) {
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`?${query}`)
      .digest("base64");
    signed = `${base}?${query}&signature=${encodeURIComponent(signature)}`;
  }

  return json({ configured: true, url: signed });
}
