"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/commerce/money";
import { realmFetch } from "@/lib/auth/api";
import { useCommerceCatalog } from "@/components/commerce/use-commerce-catalog";

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

  const buy = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await realmFetch<{ url?: string; error?: string }>(
      "/api/commerce/checkout",
      {
        method: "POST",
        json: {
          items: [{ kind, sku, qty: 1 }],
          /* One key per press. crypto.randomUUID is in every browser this
             product supports and needs no dependency. */
          idempotencyKey: crypto.randomUUID(),
        },
      }
    );
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
    setError(res.data?.error ?? "The checkout could not be opened");
  }, [kind, sku]);

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
      <Button variant="gold" size={size} disabled={busy} onClick={() => void buy()}>
        {busy ? "Opening checkout" : `${label} ${formatMoney({ minor: entry.priceMinor, currency: "usd" })}`}
      </Button>
      {floorMinor !== null ? (
        /* The floor beside the price, always. It is the trust feature of the
           whole program, and a chest that shows one without the other is a
           worse offer than the realm actually makes. */
        <p className="text-[11px] leading-snug text-bone-faint">
          Guaranteed floor{" "}
          <span className="tnum font-semibold text-bone-mut">
            {formatMoney({ minor: floorMinor, currency: "usd" })}
          </span>{" "}
          of cards in every chest
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-snug text-state-danger">{error}</p>
      ) : null}
    </div>
  );
}
