import { json } from "@/lib/auth/server";

interface Approval {
  token: string;
  spender: string;
  allowance: string;
}

interface AlchemyApproval {
  contractAddress?: string;
  tokenAddress?: string;
  spenderAddress?: string;
  spender?: string;
  allowance?: string;
  value?: string;
}

/* The Watch reads open token approvals for an address. Non-custodial:
   we only read the public ledger. Revoking is a separate signed action.
   Requires ALCHEMY_API_KEY; without it we degrade honestly. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return json({ configured: false, approvals: [], error: "invalid address" }, 400);
  }

  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    return json({ configured: false, approvals: [] });
  }

  try {
    const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenApprovals",
        params: [{ address }],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      return json({
        configured: true,
        approvals: [],
        error: "The Watch could not reach the ledger",
      });
    }

    const body = (await res.json()) as {
      result?: { approvals?: AlchemyApproval[] } | AlchemyApproval[];
      error?: { message?: string };
    };

    // Method unavailable or any RPC-level error -> honest empty result.
    if (body.error) {
      return json({ configured: true, approvals: [] });
    }

    const rawList: AlchemyApproval[] = Array.isArray(body.result)
      ? body.result
      : (body.result?.approvals ?? []);

    const approvals: Approval[] = rawList
      .map((a) => {
        const token = a.contractAddress ?? a.tokenAddress ?? "";
        const spender = a.spenderAddress ?? a.spender ?? "";
        const allowance = a.allowance ?? a.value ?? "";
        return { token, spender, allowance };
      })
      .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a.token) && /^0x[a-fA-F0-9]{40}$/.test(a.spender));

    return json({ configured: true, approvals });
  } catch {
    return json({
      configured: true,
      approvals: [],
      error: "The Watch could not reach the ledger",
    });
  }
}
