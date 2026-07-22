import { requireProfile, json } from "@/lib/auth/server";
import { tokenSafety } from "@/lib/trade/goplus";
import { tradeChainById } from "@/lib/trade/config";

/* GET /api/trade/safety?chainId=&address= -> real GoPlus token-security read
   for a coin. Members only. Honest: returns { safety: null } when the lens
   cannot read the token, so the UI never implies safety it did not verify. */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);

  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get("chainId"));
  const address = (url.searchParams.get("address") ?? "").trim();

  if (!Number.isFinite(chainId) || !tradeChainById(chainId))
    return json({ error: "This chain is not tradable." }, 400);
  if (!ADDRESS_RE.test(address))
    return json({ error: "A valid token address is required." }, 400);

  const safety = await tokenSafety(chainId, address);
  return json({ safety });
}
