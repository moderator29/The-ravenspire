import { requireProfile, getProfile, json } from "@/lib/auth/server";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit, profileKey } from "@/lib/rate-limit";
import {
  CLAIM_COLUMNS,
  CREST_SET_SLUG,
  mintGate,
  ownWallet,
  type ClaimRow,
} from "@/lib/collectibles/claims";
import { cardTokenId, crestTokenId } from "@/lib/collectibles/token-ids";
import { contractFor } from "@/lib/chain/mint-config";
import {
  claimNonce,
  signClaimVoucher,
  VOUCHER_TTL_SECONDS,
} from "@/lib/chain/claim-voucher";

/* The claim: turning a holding into a token the member holds themselves.
 *
 * GET  /api/claims          the caller's own claim history
 * POST /api/claims          issue a signed voucher for one holding
 *
 * The platform signs a sentence saying a named wallet may mint a named token
 * once, before a deadline. The member's own wallet carries that sentence to
 * the contract and pays its own gas. Nothing here mints, holds, or moves a
 * token, which is what makes the collectibles realm non-custodial in fact
 * rather than in copy (AGENTS.md rule 6).
 *
 * Nothing here is reachable until the founder deploys the contracts and
 * flips mint_live. Until then every path answers 423 or 503 and says which.
 */

/* Flag-dependent and per-caller: never baked at build time. */
export const dynamic = "force-dynamic";

const UNDEFINED_TABLE = "42P01";
const UNIQUE_VIOLATION = "23505";

/* Issuing a voucher is a signature and a database write, and a member has at
   most a few dozen holdings, so this is generous for every honest use and
   still closes the door on a loop hammering the signer. */
const CLAIM_LIMIT = 60;
const CLAIM_WINDOW_SECONDS = 3600;

export async function GET(req: Request) {
  /* Read-only auth check: never mints a profile row for a probe. Signed-out
     callers get the honest empty list, same shape as /api/interest. */
  const profile = await getProfile(req);
  /* The mint's state travels with the list because every surface that renders
     claims needs both, and two round trips to answer one question is how a
     claim button ends up rendering before the realm knows whether it can mint.
     What the client is told: whether the mint is open and on which chain.
     Never the contracts, and never anything derived from the signing key. */
  const gate = await mintGate();
  const mint = gate.open
    ? {
        open: true,
        chain: { id: gate.config.chain.id, name: gate.config.chain.name },
        explorer: gate.config.chain.explorer,
      }
    : { open: false, reason: gate.reason };

  if (!profile) return json({ claims: [], mint });
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const { data, error } = await db
    .from("collectible_claims")
    .select(CLAIM_COLUMNS)
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    /* Table not migrated yet: nobody has claimed anything. */
    if (error.code === UNDEFINED_TABLE) return json({ claims: [], mint });
    return json({ error: "unavailable" }, 503);
  }
  return json({ claims: (data ?? []) as ClaimRow[], mint });
}

export async function POST(req: Request) {
  const profile = await requireProfile(req);
  if (!profile) return json({ error: "unauthenticated" }, 401);
  const db = adminClient();
  if (!db) return json({ error: "unavailable" }, 503);

  const gate = await mintGate();
  if (!gate.open) return json({ error: gate.reason }, gate.status);

  const wallet = ownWallet(profile.wallet_address);
  if (!wallet) {
    return json(
      { error: "Link a wallet before claiming, so the realm knows where to send it" },
      400
    );
  }

  const rl = await rateLimit(
    profileKey("claim", profile.id),
    CLAIM_LIMIT,
    CLAIM_WINDOW_SECONDS
  );
  if (!rl.ok) {
    return json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    inventory_id?: unknown;
    crest_slug?: unknown;
  } | null;

  const kind = body?.kind;
  if (kind !== "card" && kind !== "crest") {
    return json({ error: "bad request" }, 400);
  }

  /* An issued voucher that nobody spent before its deadline is dead: the
     contract will refuse it, so holding the copy hostage would strand it
     forever. Sweeping here rather than on a schedule keeps the rule where the
     consequence is, and it is the reason the unique index below counts only
     live claims. A submitted claim is left alone: it may have landed, and the
     confirm route is the only place that knows. */
  await db
    .from("collectible_claims")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .eq("status", "issued")
    .lt("expires_at", new Date().toISOString());

  /* Resolve what is being claimed against the ledger that owns the fact. The
     client names a holding; it never names a token id, a contract or a
     quantity, because those are ours to decide. */
  let setSlug: string;
  let itemSlug: string;
  let inventoryId: string | null = null;
  let tokenId: string | null = null;

  if (kind === "card") {
    const inventoryIdInput = body?.inventory_id;
    if (typeof inventoryIdInput !== "string" || !inventoryIdInput) {
      return json({ error: "bad request" }, 400);
    }
    /* Scoped to the caller: a holding that is not theirs reads as not found,
       which is also the truth from where they stand. */
    const { data: copy, error } = await db
      .from("inventory")
      .select("id, set_slug, card_number, champion_slug")
      .eq("id", inventoryIdInput)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (error) return json({ error: "unavailable" }, 503);
    if (!copy) return json({ error: "You do not hold that card" }, 404);

    try {
      tokenId = cardTokenId(copy.set_slug as string, copy.card_number as number);
    } catch {
      /* A set with no frozen id space. Refusing is the only safe answer: a
         guessed id is a permanent, unfixable mistake on a public chain. */
      return json({ error: "That set cannot be minted yet" }, 409);
    }
    setSlug = copy.set_slug as string;
    itemSlug = copy.champion_slug as string;
    inventoryId = copy.id as string;
  } else {
    const crestSlug = body?.crest_slug;
    if (typeof crestSlug !== "string" || !crestSlug) {
      return json({ error: "bad request" }, 400);
    }
    const { data: held, error } = await db
      .from("user_crests")
      .select("crest_slug")
      .eq("profile_id", profile.id)
      .eq("crest_slug", crestSlug)
      .maybeSingle();
    if (error) return json({ error: "unavailable" }, 503);
    if (!held) return json({ error: "You have not earned that crest" }, 404);

    tokenId = crestTokenId(crestSlug);
    if (!tokenId) {
      /* A crest with no frozen token id is held, displayed and counted
         exactly as before. It simply has no mint yet, and saying so is
         better than inventing a number. */
      return json({ error: "That crest cannot be minted yet" }, 409);
    }
    setSlug = CREST_SET_SLUG;
    itemSlug = crestSlug;
  }

  /* Asking twice is one ask. A live claim is handed straight back rather than
     signed again, so a double tap, a retry after a dropped connection, or a
     member returning to an unfinished mint all land on the same voucher. */
  const existing = await findLiveClaim(db, {
    profileId: profile.id,
    kind,
    inventoryId,
    itemSlug,
  });
  if (existing) {
    if (existing.status === "minted") {
      return json({ error: "That is already in your wallet", claim: existing }, 409);
    }
    return json({ claim: existing, reissued: false });
  }

  const nonce = claimNonce();
  const deadline = Math.floor(Date.now() / 1000) + VOUCHER_TTL_SECONDS;
  const contract = contractFor(gate.config, kind);

  const signed = await signClaimVoucher({
    config: gate.config,
    kind,
    to: wallet,
    tokenId,
    /* One claim is one copy. The holdings ledger is per copy, so there is
       never a question of how much of a holding has been carried on-chain. */
    amount: 1,
    nonce,
    deadline,
  });

  const { data: inserted, error: insertError } = await db
    .from("collectible_claims")
    .insert({
      profile_id: profile.id,
      subject_kind: kind,
      inventory_id: inventoryId,
      set_slug: setSlug,
      item_slug: itemSlug,
      wallet_address: wallet,
      chain_id: gate.config.chain.id,
      contract,
      token_id: tokenId,
      voucher: signed,
      nonce,
      expires_at: new Date(deadline * 1000).toISOString(),
    })
    .select(CLAIM_COLUMNS)
    .single();

  if (insertError) {
    /* Two requests raced and the partial unique index caught the second. The
       first one's voucher is the real one; hand that back rather than an
       error, which is what the member would have got had they arrived a
       moment later. */
    if (insertError.code === UNIQUE_VIOLATION) {
      const raced = await findLiveClaim(db, {
        profileId: profile.id,
        kind,
        inventoryId,
        itemSlug,
      });
      if (raced) return json({ claim: raced, reissued: false });
    }
    if (insertError.code === UNDEFINED_TABLE) {
      return json({ error: "The claim ledger has not been migrated yet" }, 503);
    }
    return json({ error: "unavailable" }, 503);
  }

  return json({ claim: inserted as ClaimRow, reissued: true });
}

/* The one live claim on a holding, if there is one. Live means issued,
   submitted or minted: an open promise or a settled one. Expired and void
   claims are history and do not stand in the way of a new voucher. */
async function findLiveClaim(
  db: NonNullable<ReturnType<typeof adminClient>>,
  args: {
    profileId: string;
    kind: "card" | "crest";
    inventoryId: string | null;
    itemSlug: string;
  }
): Promise<ClaimRow | null> {
  const query = db
    .from("collectible_claims")
    .select(CLAIM_COLUMNS)
    .eq("profile_id", args.profileId)
    .in("status", ["issued", "submitted", "minted"]);

  const scoped =
    args.kind === "card"
      ? query.eq("inventory_id", args.inventoryId as string)
      : query.eq("subject_kind", "crest").eq("item_slug", args.itemSlug);

  const { data } = await scoped.maybeSingle();
  return (data as ClaimRow) ?? null;
}
