import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { profileKey, rateLimit } from "@/lib/rate-limit";
import { parseUnits } from "viem";
import { verifyTribute } from "@/lib/chain/verify-transfer";
import { tradeChainById } from "@/lib/trade/config";

/* Tips are REAL, non-custodial, wallet-to-wallet transfers. The transfer
   itself is signed and broadcast client-side from the tipper's Privy embedded
   wallet; this route only (a) resolves the recipient's linked wallet so the
   client knows where to send, and (b) records the receipt after the chain has
   confirmed the hash. The platform never holds or moves the funds.

   THE RECEIPT IS NOW READ, NOT TAKEN ON TRUST. This route used to write a row
   from a transaction hash that nothing checked, so any signed-in member could
   post a hash from a block explorer, or an invented one, and the realm would
   publish a tribute the recipient never received and ring their ravens for it.
   The hash is now checked against the chain: the transaction succeeded, it was
   sent by the tipper's own wallet, and value of at least the claimed amount
   reached the recipient's own wallet.

   An unproven tribute is still recorded, and that is deliberate. Two honest
   causes produce one: the chain has not settled the transfer yet, and the realm
   has no RPC endpoint for that chain. Refusing both would take tipping down to
   punish neither. An unproven row simply earns no notification, because the
   thing being defended here is the social proof, not the record. */

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_RE = /^\d*\.?\d+$/;
const TOKEN_RE = /^[A-Za-z0-9]{1,12}$/;

/* The chains a tribute may claim. The trade allowlist covers every mainnet the
   product touches; the two testnets are where the flow is rehearsed and the
   tip dialog's own chain table includes them, so a rehearsal receipt is not
   refused. Anything else is a chain the realm can neither name nor read, and a
   receipt on an unnameable chain is a claim that can never be checked. */
const TIP_TESTNET_IDS = new Set([11155111, 84532]); // Sepolia, Base Sepolia
function tipChainKnown(chainId: number): boolean {
  return Boolean(tradeChainById(chainId)) || TIP_TESTNET_IDS.has(chainId);
}

/* The claimed amount in wei. The amount has already been matched against
   AMOUNT_RE, so this cannot throw on shape; a value with more than eighteen
   decimal places is the one case parseUnits rejects, and it resolves to zero,
   which verifies against any real transfer rather than refusing an honest one
   over a rounding artefact. */
function safeUnits(amount: string): bigint {
  try {
    return parseUnits(amount, 18);
  } catch {
    return 0n;
  }
}

/* GET /api/tips?to=<profileId> -> the recipient's linked wallet address. */
export async function GET(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const to = new URL(req.url).searchParams.get("to");
  if (!to) return json({ error: "bad request" }, 400);

  const { data: receiver } = await db
    .from("profiles")
    .select("id, wallet_address, handle, display_name")
    .eq("id", to)
    .maybeSingle();
  if (!receiver) return json({ error: "No such recipient" }, 404);

  return json({
    wallet_address: receiver.wallet_address ?? null,
    handle: receiver.handle ?? null,
    display_name: receiver.display_name ?? null,
  });
}

/* POST /api/tips -> record a confirmed on-chain tribute.
   Body: { to, subject_type?, subject_id?, amount, token, tx_hash, chain_id? } */
export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  if (!profile.onboarded)
    return json({ error: "Complete your rites before sending tribute" }, 403);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  /* Anti-automation. This route writes a tribute row and rings the recipient's
     ravens off a client-supplied tx hash the server does not verify on-chain, so
     without a ceiling a script can spray fabricated tributes and notification
     spam at any member. A real tipper sends a handful an hour; this is far above
     genuine use and well below abuse. Keyed on the account, like every other
     mutating route (social, comments, oath). */
  const rl = await rateLimit(profileKey("tips", profile.id), 60, 3600);
  if (!rl.ok)
    return json(
      {
        error: "You pour tribute faster than the ravens can carry it. Rest a moment.",
        retryAfter: rl.retryAfter,
      },
      429
    );

  const body = (await req.json().catch(() => null)) as {
    to?: string;
    subject_type?: string | null;
    subject_id?: string | null;
    amount?: string;
    token?: string;
    tx_hash?: string;
    chain_id?: number | null;
  } | null;

  const to = body?.to;
  const amount = body?.amount?.trim();
  const token = body?.token?.trim().toUpperCase();
  const txHash = body?.tx_hash?.trim();
  const chainId =
    typeof body?.chain_id === "number" && Number.isFinite(body.chain_id)
      ? Math.floor(body.chain_id)
      : null;

  if (!to || !amount || !token || !txHash)
    return json({ error: "bad request" }, 400);
  if (!AMOUNT_RE.test(amount) || Number(amount) <= 0)
    return json({ error: "A tribute must be a positive amount" }, 400);
  if (!TOKEN_RE.test(token)) return json({ error: "bad token" }, 400);
  if (!TX_HASH_RE.test(txHash))
    return json({ error: "bad transaction hash" }, 400);
  /* chain_id is required, mirroring the trade recorder. It used to be
     optional, and omitting it skipped on-chain verification entirely: a
     receipt with no chain named could never be disproved, which made
     "unverified" a state a caller could simply choose. Now the unverified
     state is reserved for its genuine causes: a transfer the chain has not
     settled yet, a chain the realm has no RPC for (chainUncheckable inside
     verifyTribute), or a wallet not yet on file. */
  if (chainId === null || !tipChainKnown(chainId))
    return json({ error: "Name the chain the tribute rode on" }, 400);
  if (to === profile.id)
    return json(
      { error: "You cannot pay tribute to yourself, however deserving" },
      400
    );

  const { data: receiver } = await db
    .from("profiles")
    .select("id, wallet_address")
    .eq("id", to)
    .maybeSingle();
  if (!receiver) return json({ error: "No such recipient" }, 404);

  /* Idempotent on the transaction hash: a double-submit of the same confirmed
     transfer resolves to the existing receipt rather than a duplicate row. */
  const { data: prior } = await db
    .from("tips")
    .select("id")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (prior) return json({ ok: true, tip: prior.id, deduped: true });

  /* Read the chain. Both wallets have to be known for the check to mean
     anything: without the tipper's we cannot say who sent it, and without the
     recipient's we cannot say it arrived. A missing one is unproven, not
     refused, because a member whose wallet has not synced yet has done nothing
     wrong. */
  const senderWallet = profile.wallet_address;
  const recipientWallet = receiver.wallet_address as string | null;
  let verifiedAt: string | null = null;

  if (senderWallet && recipientWallet && chainId) {
    const verdict = await verifyTribute({
      chainId,
      txHash: txHash.toLowerCase() as `0x${string}`,
      from: senderWallet,
      to: recipientWallet,
      /* Native tributes only: the tip dialog sends the chain's own coin, and
         every native token in this product carries eighteen decimals. An
         ERC-20 tribute would name its contract, and verifyTribute reads the
         token's own logs for that case when the client starts sending one. */
      minAmount: safeUnits(amount),
    });
    if (!verdict.verified && !verdict.pending) {
      /* Checked, and wrong. Asking again will not change the answer, so the
         realm refuses rather than recording a claim it has disproved. */
      return json({ error: verdict.reason }, 400);
    }
    if (verdict.verified) verifiedAt = new Date().toISOString();
  }

  const { data: tip, error } = await db
    .from("tips")
    .insert({
      from_id: profile.id,
      to_id: to,
      points: null,
      amount,
      token,
      tx_hash: txHash,
      chain_id: chainId,
      verified_at: verifiedAt,
      subject_type: body?.subject_type ?? null,
      subject_id: body?.subject_id ?? null,
    })
    .select("id")
    .single();

  if (error || !tip) {
    /* A concurrent insert of the same hash trips the unique index; resolve to
       the winning row so both callers succeed. */
    const { data: raced } = await db
      .from("tips")
      .select("id")
      .eq("tx_hash", txHash)
      .maybeSingle();
    if (raced) return json({ ok: true, tip: raced.id, deduped: true });
    return json({ error: "Could not record the tribute" }, 500);
  }

  /* The raven flies only for a tribute the chain has confirmed. An unproven
     one is on the record and can be verified later; what it cannot do is
     interrupt somebody on the strength of an unchecked claim. */
  if (verifiedAt) {
    /* B3: through createNotification, so the recipient's "tips" toggle governs
       it and the realtime nudge fires. */
    await createNotification(db, {
      profile_id: to,
      kind: "tip",
      actor_id: profile.id,
      ref: body?.subject_id ?? null,
      body: `${amount} ${token}`,
    });
  }

  return json({ ok: true, tip: tip.id, verified: verifiedAt !== null });
}
