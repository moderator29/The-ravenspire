"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/commerce/money";
import { realmFetch } from "@/lib/auth/api";
import { useCommerceCatalog } from "@/components/commerce/use-commerce-catalog";
import {
  GuardInterruption,
  type GuardRefusal,
} from "@/components/commerce/guard-interruption";

/* The buy control, and the four honest things it can say.
 *
 * A single control appears on every sellable thing in the realm, and most of
 * its job is refusing correctly. There are four states before there is a
 * purchase, and each one is a different truth that a member deserves in plain
 * words rather than a greyed out button with no explanation:
 *
 *   sealed      the chapter has not launched. The chest or the shop is not
 *               open to anybody yet.
 *   unpriced    the chapter is open but the realm has not confirmed it may
 *               charge. No price is shown, because showing one the realm will
 *               not honour today is the invented data rule broken where it
 *               would actually cost somebody money.
 *   ready       priced and open. The price and, for a chest, the guaranteed
 *               floor beneath it.
 *   unavailable payments are not configured. An operational fault, said as one.
 *
 * The price is never hardcoded here and never bundled. It arrives from
 * /api/commerce/catalog, which serves money only once the founder has
 * confirmed the realm may charge it.
 *
 * IDEMPOTENT BY CONSTRUCTION. A checkout carries a key generated once per
 * press, so a double tap, a slow network or a retried request all resolve to
 * one order and one charge. The key is minted here rather than on the server
 * precisely because the server cannot tell a retry from a second purchase.
 *
 * THE FIFTH STATE, added with the compliance guardrails: refused. Checkout can
 * now answer 409 with a named reason, because a member may be short of the age
 * gate, past a spending limit, inside the velocity brake or owed a look at
 * their own 30 day total before they spend more. None of that is decided here
 * and none of it can be: every one of those decisions is made inside
 * public.commerce_checkout_guard, in the same transaction that would have
 * created the order. This control's only job is to show the member what the
 * server said, with the real numbers the server sent, and to offer the single
 * action that clears it where one exists.
 *
 * A CLEARED INTERRUPTION RETRIES THE PURCHASE, on the same idempotency key.
 * Sending a member back to find the chest again after they answered the
 * question would be a worse product and no safer, and the key means the retry
 * is the same order rather than a second one.
 */

export function BuyButton({
  kind,
  sku,
  label = "Buy",
  size = "md",
}: {
  kind: "chest" | "merch";
  sku: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}) {
  const catalog = useCommerceCatalog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<GuardRefusal | null>(null);
  /* Held across a refusal so that clearing an interruption retries the SAME
     order rather than opening a second one. */
  const [key, setKey] = useState<string | null>(null);

  const buy = useCallback(
    async (idempotencyKey: string) => {
      setBusy(true);
      setError(null);
      setRefusal(null);
      const res = await realmFetch<{
        url?: string;
        error?: string;
        reason?: string;
        state?: GuardRefusal["state"];
        clearsAt?: string | null;
        capMinor?: number | null;
        thresholdMinor?: number | null;
        minimum?: number | null;
      }>("/api/commerce/checkout", {
        method: "POST",
        json: { items: [{ kind, sku, qty: 1 }], idempotencyKey },
      });
      if (res.status === 401) {
        window.location.assign("/signin");
        return;
      }
      if (res.ok && res.data?.url) {
        /* The hosted page owns the card details. No card data ever touches the
           realm, which is why the checkout is a redirect and not a form. */
        window.location.assign(res.data.url);
        return;
      }
      setBusy(false);
      /* A guardrail refusal is a different thing from a failure and is said
         differently. It carries the member's own numbers and, sometimes, a
         single action that clears it. */
      if (res.data?.reason) {
        setRefusal({
          reason: res.data.reason,
          error: res.data.error ?? "The realm is pausing this purchase",
          state: res.data.state ?? null,
          clearsAt: res.data.clearsAt ?? null,
          capMinor: res.data.capMinor ?? null,
          thresholdMinor: res.data.thresholdMinor ?? null,
          minimum: res.data.minimum ?? null,
        });
        return;
      }
      setError(res.data?.error ?? "The checkout could not be opened");
    },
    [kind, sku]
  );

  const press = useCallback(() => {
    /* One key per press. crypto.randomUUID is in every browser this product
       supports and needs no dependency. */
    const next = crypto.randomUUID();
    setKey(next);
    void buy(next);
  }, [buy]);

  if (catalog.state === "loading") return null;

  const chapterOpen = kind === "chest" ? catalog.live.chests : catalog.live.mercer;

  if (!chapterOpen) {
    return (
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        {kind === "chest" ? "Sealed until launch" : "The Mercer opens at launch"}
      </p>
    );
  }

  if (!catalog.confirmed) {
    /* Open, but the realm has not confirmed it may charge. No number, and no
       pretending there is one. */
    return (
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Priced at launch
      </p>
    );
  }

  /* Narrowed by kind rather than by a union lookup, so the floor below is
     typed as the chest-only field it actually is. */
  const chest =
    kind === "chest" ? catalog.chests.find((c) => c.sku === sku) : undefined;
  const merch =
    kind === "merch" ? catalog.merch.find((m) => m.sku === sku) : undefined;
  const entry = chest ?? merch;

  if (!entry) {
    return (
      <p className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
        Not for sale
      </p>
    );
  }

  const floorMinor = chest ? chest.floorMinor : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="gold" size={size} disabled={busy} onClick={press}>
        {busy ? "Opening checkout" : `${label} ${formatMoney({ minor: entry.priceMinor, currency: "usd" })}`}
      </Button>
      <GuardInterruption
        refusal={refusal}
        onDismiss={() => setRefusal(null)}
        onCleared={() => {
          setRefusal(null);
          if (key) void buy(key);
        }}
      />
      {floorMinor !== null ? (
        /* The floor beside the price, always. It is the trust feature of the
           whole program, and a chest that shows one without the other is a
           worse offer than the realm actually makes.
         *
         * IT SAYS "AT THE REALM'S OWN VALUATION" AND THAT IS NOT HEDGING. This
         * read "Guaranteed floor" and it should not have. Nothing in the realm
         * redeems a card at its floor: there is no buy back, and the only place
         * a member turns a card into money is the Bazaar, where another member
         * decides what it is worth. So the number is a valuation the realm
         * publishes and stands behind as a catalogue value, not a sum anybody
         * can claim, and the word "guaranteed" beside a dollar figure on a
         * mystery box reads as exactly the claim it is not.
         *
         * lib/collectibles/hoard.ts already said this in a comment ("what the
         * platform stands behind, not a market price") and declined to quote a
         * floor on the trophy case for the same reason. The two surfaces
         * disagreed and this one was the one taking the money. */
        <p className="text-[11px] leading-snug text-bone-faint">
          Floor{" "}
          <span className="tnum font-semibold text-bone-mut">
            {formatMoney({ minor: floorMinor, currency: "usd" })}
          </span>{" "}
          of cards in every chest, at the realm&apos;s own valuation
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-snug text-state-danger">{error}</p>
      ) : null}
    </div>
  );
}
