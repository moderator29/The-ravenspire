"use client";

import { useCallback, useRef, useState } from "react";
import { encodeFunctionData } from "viem";
import { useSendTransaction } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { realmFetch } from "@/lib/auth/api";
import { CLAIM_ABI } from "@/lib/chain/claim-abi";

/* The claim control: three steps that must look like one.
 *
 * 1. Ask the realm for a voucher. The server decides the token, the contract,
 *    the amount and the wallet; this component names a holding and nothing
 *    else, because a client that can name its own token id is a client that
 *    can mint whatever it likes.
 * 2. The member's OWN wallet sends the mint and pays its own gas. The realm
 *    never signs this transaction, never holds the token, and never takes
 *    custody for a moment in between (AGENTS.md rule 6). Privy's embedded
 *    wallet is what makes that a single tap rather than an education.
 * 3. Hand the hash back to be verified against the chain. The claim only
 *    settles because the server read the receipt, not because this component
 *    said the transaction worked.
 *
 * The waiting is the honest part. A mint takes a few seconds on Base and the
 * server deliberately waits for confirmations before it calls a claim settled,
 * so `confirming` polls rather than declaring victory early. A collectible
 * that says "yours" before it is would be the one lie in this whole loop that
 * a member could actually be hurt by.
 */

type Phase = "idle" | "asking" | "signing" | "confirming" | "done" | "error";

/* One claim is one copy, so the caller names a copy: a card by the holding it
   sits in, a crest by its slug. Exactly the shape POST /api/claims takes. */
export type ClaimSubject =
  | { kind: "card"; inventoryId: string }
  | { kind: "crest"; crestSlug: string };

type ClaimResponse = {
  claim?: {
    id: string;
    contract: string;
    chain_id: number;
    status: string;
    voucher?: {
      message?: {
        to: string;
        tokenId: string;
        amount: string;
        nonce: string;
        deadline: string;
        soulbound: boolean;
      };
      signature?: string;
    };
  };
  error?: string;
};

/* How long to keep asking the chain before letting the member get on with
   their day. Twenty tries at three seconds is a minute, which is generous for
   Base and short enough that a stuck transaction does not hold a screen
   hostage. A timeout here is not a failure: the claim keeps its hash, and the
   next visit picks the answer up. */
const POLL_TRIES = 20;
const POLL_INTERVAL_MS = 3000;

export function ClaimButton({
  subject,
  label = "Claim to your wallet",
  size = "sm",
  onClaimed,
}: {
  subject: ClaimSubject;
  label?: string;
  size?: "sm" | "md" | "lg";
  onClaimed?: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  /* Guards the whole sequence rather than the button, because the slow part is
     the wallet prompt and a second press while that is open would ask the
     realm for a second voucher on the same copy. */
  const running = useRef(false);

  const claim = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setMessage(null);
    setPhase("asking");

    try {
      const issued = await realmFetch<ClaimResponse>("/api/claims", {
        method: "POST",
        json:
          subject.kind === "card"
            ? { kind: "card", inventory_id: subject.inventoryId }
            : { kind: "crest", crest_slug: subject.crestSlug },
      });

      const claimRow = issued.data?.claim;
      if (!issued.ok || !claimRow) {
        /* 409 with a claim attached is the good kind of refusal: it is already
           in their wallet. Everything else says what went wrong, in the
           server's own words, because those are written for members. */
        if (issued.status === 409 && issued.data?.claim?.status === "minted") {
          setPhase("done");
          onClaimed?.();
          return;
        }
        setPhase("error");
        setMessage(issued.data?.error ?? "The claim could not be opened");
        return;
      }

      if (claimRow.status === "minted") {
        setPhase("done");
        onClaimed?.();
        return;
      }

      const voucher = claimRow.voucher?.message;
      const signature = claimRow.voucher?.signature;
      if (!voucher || !signature) {
        setPhase("error");
        setMessage("The voucher came back incomplete");
        return;
      }

      setPhase("signing");
      /* The member's wallet, the member's gas, the member's transaction. The
         call is encoded here from the shared ABI so what is sent is exactly
         what the contract was told to expect. */
      const data = encodeFunctionData({
        abi: CLAIM_ABI,
        functionName: "claim",
        args: [
          {
            to: voucher.to as `0x${string}`,
            tokenId: BigInt(voucher.tokenId),
            amount: BigInt(voucher.amount),
            nonce: voucher.nonce as `0x${string}`,
            deadline: BigInt(voucher.deadline),
            soulbound: voucher.soulbound,
          },
          signature as `0x${string}`,
        ],
      });

      const sent = await sendTransaction({
        to: claimRow.contract as `0x${string}`,
        data,
        chainId: claimRow.chain_id,
      });
      const txHash = sent?.hash;
      if (!txHash) {
        setPhase("error");
        setMessage("The wallet did not return a transaction");
        return;
      }

      setPhase("confirming");
      for (let attempt = 0; attempt < POLL_TRIES; attempt += 1) {
        const confirmed = await realmFetch<{ status?: string; error?: string }>(
          `/api/claims/${claimRow.id}/confirm`,
          { method: "POST", json: { tx_hash: txHash } }
        );
        if (confirmed.ok && confirmed.data?.status === "minted") {
          setPhase("done");
          onClaimed?.();
          return;
        }
        /* 202 is the honest "not yet". Anything else is settled as wrong and
           there is nothing to wait for. */
        if (confirmed.status !== 202) {
          setPhase("error");
          setMessage(confirmed.data?.error ?? "The mint could not be verified");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      /* Still unconfirmed. The claim holds the hash, so this is a pause, not a
         loss, and the sentence says so. */
      setPhase("error");
      setMessage("Still settling on the chain. Check back shortly.");
    } catch (err) {
      setPhase("error");
      /* A member closing the wallet prompt is not an error worth shouting
         about, and it is the most common way this path ends. */
      const text = err instanceof Error ? err.message : "";
      setMessage(
        /rejected|denied|cancel/i.test(text)
          ? "Cancelled. Nothing was sent."
          : "The mint could not be sent"
      );
    } finally {
      running.current = false;
    }
  }, [subject, sendTransaction, onClaimed]);

  if (phase === "done") {
    return (
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">
        In your wallet
      </p>
    );
  }

  const busy = phase === "asking" || phase === "signing" || phase === "confirming";

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="gold"
        size={size}
        disabled={busy}
        onClick={() => void claim()}
      >
        {phase === "asking"
          ? "Opening the claim"
          : phase === "signing"
            ? "Confirm in your wallet"
            : phase === "confirming"
              ? "Settling on the chain"
              : label}
      </Button>
      {message ? (
        <p className="text-[11px] leading-snug text-bone-faint">{message}</p>
      ) : null}
    </div>
  );
}
