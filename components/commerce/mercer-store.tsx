"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import {
  MERCER_CATEGORIES,
  type MercerSku,
} from "@/lib/collectibles/mercer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Sheet, useIsMobile } from "@/components/ui/sheet";
import {
  ForgeCorners,
  ForgeTicks,
  ForgeHairline,
} from "@/components/ui/forge-frame";
import { cx } from "@/components/ui/cx";

/* The live Mercer store (V2 Part Two, section 26.3, buy flow).
 *
 * Rendered only when the server has both unsealed the chapter (mercer_live) and
 * confirmed prices, decided server-side in the page. The client is never
 * trusted with that gate.
 *
 * NO PRICE IS RENDERED HERE, the same posture the Warchests store takes. Prices
 * live server-only in lib/commerce/catalog.ts and never reach a client surface
 * (rule 4, real-data-only). The cart selects SKUs and quantities; the server
 * prices the order and the payment provider's own hosted page shows the
 * authoritative total. Checkout POSTs to /api/commerce/checkout with a
 * client-generated idempotency key, so a double click or a retry is one order
 * and one charge, and redirects to the crypto checkout URL the route returns.
 *
 * Every merch piece is a physical good, so a non-empty cart always collects a
 * shipping address. Responsive is not a resize (rule 15): the cart is a sticky
 * side panel on desktop and a thumb-reachable bottom sheet on a phone. */

interface CheckoutResponse {
  orderId?: string;
  url?: string;
  error?: string;
}

const MAX_QTY = 10;

interface ShippingAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
}

const EMPTY_ADDRESS: ShippingAddress = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal: "",
  country: "",
};

function addressComplete(a: ShippingAddress): boolean {
  return Boolean(
    a.name && a.line1 && a.city && a.region && a.postal && a.country
  );
}

export function MercerStore({ skus }: { skus: MercerSku[] }) {
  const { ready, authenticated, enabled, signInX } = useRealmAuth();
  const isMobile = useIsMobile();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skuByKey = useMemo(
    () => new Map(skus.map((s) => [s.sku, s] as const)),
    [skus]
  );

  const lines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([sku, qty]) => ({ sku, qty }));
  const count = lines.reduce((n, l) => n + l.qty, 0);

  function setQty(sku: string, qty: number) {
    setCart((prev) => ({
      ...prev,
      [sku]: Math.max(0, Math.min(MAX_QTY, qty)),
    }));
  }

  /* Idempotency keys, one per distinct cart. A retry of the same cart reuses
     its key so the checkout route dedupes to one order and one charge; changing
     the cart mints a new key, and a new order. */
  const keyByCart = useRef<Map<string, string>>(new Map());
  function cartKey(): string {
    const serialized = lines
      .map((l) => `${l.sku}:${l.qty}`)
      .sort()
      .join("|");
    const existing = keyByCart.current.get(serialized);
    if (existing) return existing;
    const key = crypto.randomUUID();
    keyByCart.current.set(serialized, key);
    return key;
  }

  const addressOk = count === 0 || addressComplete(address);

  async function checkout() {
    if (busy || count === 0) return;
    if (!authenticated) {
      signInX();
      return;
    }
    if (!addressOk) {
      setError("Add a delivery address to check out.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await realmFetch<CheckoutResponse>("/api/commerce/checkout", {
      method: "POST",
      json: {
        idempotencyKey: cartKey(),
        items: lines.map((l) => ({ kind: "merch", sku: l.sku, qty: l.qty })),
        shipping: address,
      },
    });
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    const map: Record<number, string> = {
      401: "Enter the realm to check out.",
      409: "Checkout is not open yet.",
      423: "The Mercer is sealed until launch.",
      429: "Too many attempts. Give it a moment.",
      503: "Checkout is resting. Try again shortly.",
    };
    setError(map[res.status] ?? res.data?.error ?? "Checkout could not start.");
    setBusy(false);
  }

  const cartPanel = (
    <CartPanel
      skuByKey={skuByKey}
      lines={lines}
      count={count}
      address={address}
      setAddress={setAddress}
      setQty={setQty}
      addressOk={addressOk}
      error={error}
      busy={busy}
      ready={ready}
      authenticated={authenticated}
      enabled={enabled}
      onSignIn={signInX}
      onCheckout={checkout}
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5">
      <div className="flex flex-col gap-6 pb-24 lg:pb-0">
        {MERCER_CATEGORIES.map((cat) => {
          const items = skus.filter((s) => s.category === cat.key);
          if (items.length === 0) return null;
          return (
            <section key={cat.key} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-steel-line pb-2">
                <h2 className="gold-text font-display text-lg font-semibold">
                  {cat.label}
                </h2>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
                  {cat.plain}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {items.map((sku) => (
                  <StoreCard
                    key={sku.sku}
                    sku={sku}
                    qty={cart[sku.sku] ?? 0}
                    setQty={(q) => setQty(sku.sku, q)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Desktop: the cart rides along in a sticky rail. */}
      <aside className="hidden lg:sticky lg:top-4 lg:block">{cartPanel}</aside>

      {/* Mobile: a thumb-reachable bar summons the cart as a bottom sheet. */}
      {isMobile && (
        <>
          <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-steel-line bg-panel/95 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md">
            <Button
              variant="gold"
              size="lg"
              block
              disabled={count === 0}
              onClick={() => setSheetOpen(true)}
            >
              <Icon name="wallet" className="h-4 w-4" />
              {count === 0 ? "Your cart is empty" : `Review cart (${count})`}
            </Button>
          </div>
          <Sheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="Your cart"
            description="Your exact total is confirmed at secure checkout."
          >
            {cartPanel}
          </Sheet>
        </>
      )}
    </div>
  );
}

function QtyStepper({
  qty,
  setQty,
  label,
}: {
  qty: number;
  setQty: (q: number) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5" aria-label={label}>
      <Button
        variant="glass"
        size="sm"
        pad="none"
        aria-label={`Remove one ${label}`}
        disabled={qty <= 0}
        onClick={() => setQty(qty - 1)}
        className="w-9"
      >
        {/* No minus glyph in the flat set, so a bar carries the meaning. */}
        <span
          aria-hidden
          className="block h-0.5 w-3 rounded-[var(--radius-full)] bg-current"
        />
      </Button>
      <span className="tnum w-6 text-center text-sm font-semibold text-bone">
        {qty}
      </span>
      <Button
        variant="glass"
        size="sm"
        pad="none"
        aria-label={`Add one ${label}`}
        disabled={qty >= MAX_QTY}
        onClick={() => setQty(qty + 1)}
        className="w-9"
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* One piece in the live store, drawn in the same forged-gold vocabulary as the
   Reliquary card: a framed product shot over an obsidian-and-gold info plate.
   Unlike the preview card this one carries two jobs, navigation and add-to-cart,
   so it is not one big link: the shot and the name are their own focusable link
   into the piece's inner page, and the qty stepper and Add button are sibling
   controls in the footer. No nested interactives. */
function StoreCard({
  sku,
  qty,
  setQty,
}: {
  sku: MercerSku;
  qty: number;
  setQty: (q: number) => void;
}) {
  const inCart = qty > 0;
  return (
    <div className="group flex flex-col gap-2">
      <Link
        href={`/mercer/${sku.sku}`}
        aria-label={`${sku.name}. ${sku.blurb} Open the piece.`}
        className="flex flex-col gap-2 rounded-lg outline-none transition-transform duration-fast ease-out-quint hover:-translate-y-1 focus-visible:-translate-y-1"
      >
        {/* The product shot, framed in forged gold. No text on the art. */}
        <div
          className={cx(
            "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-void shadow-[0_10px_28px_-12px_rgba(0,0,0,0.75)] transition-colors duration-fast",
            inCart ? "border-gold/55" : "border-gold/25 group-hover:border-gold/55"
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[image:radial-gradient(70%_55%_at_50%_42%,rgba(217,176,64,0.10),transparent_72%)]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sku.art}
            alt=""
            draggable={false}
            className="relative h-full w-full object-contain p-3"
            style={{ filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.5))" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_38px_rgba(0,0,0,0.55)]"
          />
          {inCart && (
            <Badge variant="gold" className="absolute right-2 top-2">
              {qty}
            </Badge>
          )}
          <ForgeCorners />
          <ForgeTicks />
        </div>

        {/* The info plate. Name on its own line in the gold gradient. */}
        <div className="relative overflow-hidden rounded-md border border-gold/25 bg-gradient-to-b from-panel-warm to-void px-3 py-2.5 transition-colors duration-fast group-hover:border-gold/50">
          <ForgeHairline />
          <span className="gold-text block font-display text-sm font-semibold leading-tight">
            {sku.name}
          </span>
          <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.14em] text-bone-faint">
            {sku.blurb}
          </span>
        </div>
      </Link>

      {/* Cart controls, siblings of the link so the two interactives never nest. */}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bone-faint">
          {inCart ? "In cart" : "Add"}
        </span>
        {inCart ? (
          <QtyStepper qty={qty} setQty={setQty} label={sku.name} />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setQty(1)}>
            <Icon name="plus" className="h-3.5 w-3.5 text-gold" />
            Add
          </Button>
        )}
      </div>
    </div>
  );
}

function CartPanel({
  skuByKey,
  lines,
  count,
  address,
  setAddress,
  setQty,
  addressOk,
  error,
  busy,
  ready,
  authenticated,
  enabled,
  onSignIn,
  onCheckout,
}: {
  skuByKey: Map<string, MercerSku>;
  lines: { sku: string; qty: number }[];
  count: number;
  address: ShippingAddress;
  setAddress: React.Dispatch<React.SetStateAction<ShippingAddress>>;
  setQty: (sku: string, qty: number) => void;
  addressOk: boolean;
  error: string | null;
  busy: boolean;
  ready: boolean;
  authenticated: boolean;
  enabled: boolean;
  onSignIn: () => void;
  onCheckout: () => void;
}) {
  return (
    <Card variant="raised" radius="xl" className="flex flex-col gap-4">
      <div className="hidden items-center gap-2 lg:flex">
        <Icon name="wallet" className="h-4 w-4 text-gold" />
        <h2 className="font-display text-base font-semibold text-bone">
          Your cart
        </h2>
        {count > 0 && (
          <Badge variant="gold" className="ml-auto">
            {count}
          </Badge>
        )}
      </div>

      {count === 0 ? (
        <p className="text-sm text-bone-mut">
          Add a piece to begin. Your exact total is confirmed at secure
          checkout.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => {
            const sku = skuByKey.get(l.sku);
            if (!sku) return null;
            return (
              <li
                key={l.sku}
                className="flex items-center gap-3 rounded-md border border-steel-line bg-obsidian/40 px-2.5 py-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sku.art}
                  alt=""
                  aria-hidden
                  className="h-10 w-10 shrink-0 rounded-sm object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-bone">
                    {sku.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(l.sku, 0)}
                    className="inline-flex items-center text-[11px] text-bone-faint underline decoration-steel-line underline-offset-2 transition-colors duration-fast hover:text-ember touch:min-h-11 touch:min-w-11"
                  >
                    Remove
                  </button>
                </span>
                <QtyStepper
                  qty={l.qty}
                  setQty={(q) => setQty(l.sku, q)}
                  label={sku.name}
                />
              </li>
            );
          })}
        </ul>
      )}

      {count > 0 && (
        <fieldset className="flex flex-col gap-2.5 border-t border-steel-line pt-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-bone-faint">
            Deliver to
          </legend>
          <Field label="Full name">
            <Input
              value={address.name}
              onChange={(e) =>
                setAddress((a) => ({ ...a, name: e.target.value }))
              }
              autoComplete="name"
              className="h-9"
            />
          </Field>
          <Field label="Address">
            <Input
              value={address.line1}
              onChange={(e) =>
                setAddress((a) => ({ ...a, line1: e.target.value }))
              }
              autoComplete="address-line1"
              placeholder="Street and number"
              className="h-9"
            />
          </Field>
          <Input
            value={address.line2}
            onChange={(e) =>
              setAddress((a) => ({ ...a, line2: e.target.value }))
            }
            autoComplete="address-line2"
            placeholder="Apartment, suite (optional)"
            aria-label="Address line 2 (optional)"
            className="h-9"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="City">
              <Input
                value={address.city}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, city: e.target.value }))
                }
                autoComplete="address-level2"
                className="h-9"
              />
            </Field>
            <Field label="Region">
              <Input
                value={address.region}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, region: e.target.value }))
                }
                autoComplete="address-level1"
                className="h-9"
              />
            </Field>
            <Field label="Postal code">
              <Input
                value={address.postal}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, postal: e.target.value }))
                }
                autoComplete="postal-code"
                className="h-9"
              />
            </Field>
            <Field label="Country">
              <Input
                value={address.country}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, country: e.target.value }))
                }
                autoComplete="country-name"
                className="h-9"
              />
            </Field>
          </div>
        </fieldset>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 text-xs text-state-danger"
        >
          <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {!ready ? null : !authenticated ? (
        enabled ? (
          <Button variant="gold" size="lg" block onClick={onSignIn}>
            <Icon name="xlogo" className="h-4 w-4" />
            Enter to check out
          </Button>
        ) : (
          <p className="text-xs text-bone-faint">
            The Gatehouse is resting here.{" "}
            <Link href="/signin" className="text-gold underline">
              The gate
            </Link>{" "}
            opens once it is mounted.
          </p>
        )
      ) : (
        <Button
          variant="gold"
          size="lg"
          block
          loading={busy}
          disabled={count === 0}
          onClick={onCheckout}
        >
          {count === 0 ? "Cart is empty" : "Secure checkout"}
        </Button>
      )}

      <p className="text-[11px] leading-relaxed text-bone-faint">
        Your exact total, taxes and any shipping are shown on the secure crypto
        checkout page before you pay. Every piece is made to order in a small
        run.
      </p>
    </Card>
  );
}
