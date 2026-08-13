"use client";

import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, parseAbi } from "viem";
import { useSendTransaction } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { realmFetch } from "@/lib/auth/api";

/* THE BUY CONTROL: four steps that must look like one, and not one of them
 * hands the platform anything.
 *
 *   1. RESERVE. The realm freezes this listing to this buyer, at this price,
 *      with the two payees fixed, for half an hour. Nothing has moved and
 *      nothing is held. What the buyer gets is the guarantee that the trade
 *      will still be there when they sign: the seller cannot withdraw it,
 *      re-price it, sell it to somebody else, burn the card, or carry it to
 *      their own wallet.
 *
 *   2. PAY THE SELLER. The buyer's OWN wallet sends the seller's own wallet
 *      the proceeds, and pays its own gas. The platform never signs this, never
 *      receives it, and could not intercept it if it wanted to.
 *
 *   3. PAY THE FEE. A second transfer, to the Coffers, for the protocol fee
 *      the buyer was shown before any of this began.
 *
 *   4. HAND BACK THE HASHES. The realm reads each receipt off the chain and
 *      only then records the leg. The card moves when both are proven, and it
 *      moves straight from the seller to the buyer.
 *
 * WHY TWO TRANSFERS. A plain ERC-20 transfer pays one address and this trade
 * has two payees. The single-signature version of that is the buyer paying the
 * platform, which then forwards the seller's share, and that is custody of
 * somebody else's money for however long the forwarding takes. Two signatures
 * is the price of never touching a seller's proceeds, and it is the right
 * price. A wallet that can batch calls pays both in one transaction and this
 * flow settles on the first hash, because the server records whatever the
 * receipt actually proves rather than what the client says it does.
 *
 * THE SELLER IS PAID FIRST, ON PURPOSE. A member who abandons the flow between
 * the two prompts has paid the seller and owes only the fee, which leaves the
 * seller whole and the trade completable when they come back. The other order
 * would take a fee for a trade that never happened.
 *
 * THE WAITING IS THE HONEST PART. The server waits for confirmations before it
 * calls a leg paid, so this polls rather than declaring victory early. A trade
 * that said "yours" before the chain agreed would be the one lie here a member
 * could actually be hurt by.
 */

/* The only call this component ever makes. Written out rather than imported
   from a token library so what is encoded is exactly what is sent, which is
   the same discipline the claim control applies to the mint. */
const ERC20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

type Phase =
  | "idle"
  | "reserving"
  | "signing"
  | "confirming"
  | "done"
  | "error";

type Leg = {
  leg: "seller" | "fee";
  to: string;
  amount: string;
  minor: number;
};

type ReserveResponse = {
  reservation?: {
    listing_id: string;
    legs: Leg[];
    token: { address: string; symbol: string; decimals: number };
    chain_id: number;
    seller_paid: boolean;
    fee_paid: boolean;
  };
  error?: string;
};

type PayResponse = {
  settled?: boolean;
  seller_paid?: boolean;
  fee_paid?: boolean;
  pending?: boolean;
  error?: string;
};

/* Twenty tries at three seconds is a minute per leg, which is generous for
   Base and short enough that a stuck transaction does not hold a screen
   hostage. A timeout is not a loss: the payment is on the chain, the
   reservation cannot be released once a leg is paid, and the next visit picks
   the trade up where it stopped. */
const POLL_TRIES = 20;
const POLL_INTERVAL_MS = 3000;

export function BuyButton({
  listingId,
  label = "Buy",
  size = "sm",
  onSettled,
}: {
  listingId: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  onSettled?: () => void;
}) {
  const { sendTransaction } = useSendTransaction();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  /* Guards the whole sequence rather than the button, because the slow part is
     the wallet prompt and a second press while one is open would reserve and
     pay twice. */
  const running = useRef(false);

  const buy = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setMessage(null);
    setPhase("reserving");

    try {
      const reserved = await realmFetch<ReserveResponse>(
        `/api/market/${listingId}/reserve`,
        { method: "POST" }
      );
      const reservation = reserved.data?.reservation;
      if (!reserved.ok || !reservation) {
        setPhase("error");
        setMessage(reserved.data?.error ?? "That card could not be reserved");
        return;
      }

      /* A resumed purchase skips whatever has already been proven. A member
         who came back to an unfinished trade is never asked to pay twice. */
      const paid = new Set<string>();
      if (reservation.seller_paid) paid.add("seller");
      if (reservation.fee_paid) paid.add("fee");

      for (const leg of reservation.legs) {
        if (paid.has(leg.leg)) continue;

        setPhase("signing");
        setMessage(
          leg.leg === "seller"
            ? "Paying the seller, from your wallet to theirs"
            : "Paying the protocol fee"
        );

        const data = encodeFunctionData({
          abi: ERC20,
          functionName: "transfer",
          /* The payee and the amount come from the reservation the server
             froze. Nothing here decides where money goes or how much of it. */
          args: [leg.to as `0x${string}`, BigInt(leg.amount)],
        });

        const sent = await sendTransaction({
          to: reservation.token.address as `0x${string}`,
          data,
          chainId: reservation.chain_id,
        });
        const txHash = sent?.hash;
        if (!txHash) {
          setPhase("error");
          setMessage("The wallet did not return a transaction");
          return;
        }

        setPhase("confirming");
        setMessage("Settling on the chain");

        let recorded = false;
        for (let attempt = 0; attempt < POLL_TRIES; attempt += 1) {
          const res = await realmFetch<PayResponse>(
            `/api/market/${listingId}/pay`,
            { method: "POST", json: { tx_hash: txHash } }
          );

          if (res.ok && res.data?.settled) {
            setPhase("done");
            setMessage(null);
            onSettled?.();
            return;
          }
          if (res.ok) {
            /* One leg landed. A wallet that batched both would have settled
               above, so reaching here means the other half is still owed. */
            if (res.data?.seller_paid) paid.add("seller");
            if (res.data?.fee_paid) paid.add("fee");
            recorded = true;
            break;
          }
          /* 202 is the honest "not yet". Anything else is settled as wrong and
             there is nothing to wait for. */
          if (res.status !== 202) {
            setPhase("error");
            setMessage(res.data?.error ?? "That payment could not be verified");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        if (!recorded) {
          /* Still unconfirmed. The payment is on the chain and the reservation
             cannot be taken from them now that a leg is in flight, so this is a
             pause rather than a loss, and the sentence says so. */
          setPhase("error");
          setMessage(
            "Still settling on the chain. Your payment is safe and the trade will finish. Check back shortly."
          );
          return;
        }
      }

      /* Every leg was already paid before this run began, which is what a
         member who completed both prompts and lost the response sees. */
      setPhase("done");
      setMessage(null);
      onSettled?.();
    } catch (err) {
      setPhase("error");
      /* A member closing the wallet prompt is not an error worth shouting
         about, and it is the most common way this path ends. */
      const text = err instanceof Error ? err.message : "";
      setMessage(
        /rejected|denied|cancel/i.test(text)
          ? "Cancelled. Nothing was sent."
          : "The payment could not be sent"
      );
    } finally {
      running.current = false;
    }
  }, [listingId, sendTransaction, onSettled]);

  if (phase === "done") {
    return (
      <p className="text-[11px] uppercase tracking-[0.2em] text-gold">
        In your Hoard
      </p>
    );
  }

  const busy =
    phase === "reserving" || phase === "signing" || phase === "confirming";

  return (
    <div className="flex flex-col items-stretch gap-1">
      <Button
        variant="gold"
        size={size}
        dense={size === "sm"}
        disabled={busy}
        onClick={() => void buy()}
      >
        {phase === "reserving"
          ? "Holding it for you"
          : phase === "signing"
            ? "Confirm in your wallet"
            : phase === "confirming"
              ? "Settling"
              : label}
      </Button>
      {message ? (
        <p className="text-[11px] leading-snug text-bone-faint">{message}</p>
      ) : null}
    </div>
  );
}
