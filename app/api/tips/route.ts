import { requireProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";

/* Tips are REAL, non-custodial, wallet-to-wallet transfers. The transfer
   itself is signed and broadcast client-side from the tipper's Privy embedded
   wallet; this route only (a) resolves the recipient's linked wallet so the
   client knows where to send, and (b) records the receipt after the chain has
   confirmed the hash. The platform never holds or moves the funds. */

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_RE = /^\d*\.?\d+$/;
const TOKEN_RE = /^[A-Za-z0-9]{1,12}$/;

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
  if (to === profile.id)
    return json(
      { error: "You cannot pay tribute to yourself, however deserving" },
      400
    );

  const { data: receiver } = await db
    .from("profiles")
    .select("id")
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

  await db.from("notifications").insert({
    profile_id: to,
    kind: "tip",
    actor_id: profile.id,
    subject_id: body?.subject_id ?? null,
    body: `${amount} ${token}`,
  });

  return json({ ok: true, tip: tip.id });
}
