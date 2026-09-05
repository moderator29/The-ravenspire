"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select, Toggle } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/wallet/copy-button";
import { realmFetch } from "@/lib/auth/api";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { setOneCards } from "@/lib/collectibles/set-one";
import { AdminHeader, AdminNote, AdminStack, TOUCH } from "@/app/admin/ui";

/* COMMERCE, at the council table.
 *
 * Two complete server routes had no door in front of them. /api/admin/commerce/
 * redemption mints the printed code that bridges a physical Reliquary into a
 * member's Hoard, and /api/admin/commerce/refund reverses an order and withdraws
 * the entitlements it granted. Both were reachable only by hand crafting a POST,
 * which means in practice a refund was a curl command written under pressure
 * against a schema the operator had to remember, on the one flow in the product
 * that moves somebody else's money.
 *
 * ARCHETYPE: Console, Ledger register, ornament budget zero. These are two
 * forms and their receipts. Nothing here celebrates: a refund is an apology and
 * a redemption code is stationery.
 *
 * REAL DATA ONLY, and here that means the pickers. The chest list is the real
 * catalog and the card list is the real Set One, so an operator cannot mint a
 * code granting a card that does not exist. The server validates both again and
 * is the authority; this only makes the mistake hard to make.
 *
 * THE CODE IS SHOWN ONCE, which is a property of the route rather than of this
 * page: only its hash is stored, so the plaintext exists in the response and
 * nowhere else. The panel says so plainly and puts a copy control next to it,
 * because a steward who closes this card without copying has to mint another.
 */

const CHESTS = CHEST_TIERS.map((t) => ({
  value: t.sku,
  label: `${t.name} (${t.cardCount} cards)`,
}));

const CARDS = setOneCards.map((c) => ({
  value: String(c.number),
  label: `No. ${c.number} ${c.champion.name}, ${c.champion.rarity}`,
}));

interface MintedCode {
  code: string;
  redemptionId: string;
  chestSku: string;
  cards: number;
}

interface RefundResult {
  refunded: boolean;
  reversed: number;
  alreadyOpened: number;
}

/* The realm's words for what the routes answer with. An operator reading
   "not_refundable" learns the request failed; they do not learn what to do. */
function redemptionRefusal(error: string | undefined, status: number): string {
  if (status === 429) return "Too many codes minted this hour. Wait, then mint again.";
  if (error === "unknown_chest") return "That chest is not in the catalog.";
  if (error === "commerce is not migrated yet")
    return "The commerce tables are not migrated in this environment yet.";
  if (error === "could not allocate a unique code")
    return "No unique code could be allocated. Mint again.";
  return error ?? "The code was not minted. Try again.";
}

function refundRefusal(
  error: string | undefined,
  orderStatus: string | undefined,
  status: number
): string {
  if (status === 429) return "Too many refunds this hour. Wait, then try again.";
  if (error === "order_not_found") return "No order carries that id.";
  if (error === "already_refunded") return "That order was already refunded.";
  if (error === "not_refundable")
    return `That order stands at "${orderStatus ?? "an unrefundable state"}", so there is nothing to reverse.`;
  if (error === "refund_failed")
    return "The provider refused the reversal, so nothing was recorded. The order is untouched.";
  if (error === "Payments are not configured")
    return "Payments are not configured here, so no money can be moved. Record a refund made by hand instead.";
  if (error === "commerce is not migrated yet" || error === "not migrated")
    return "The commerce tables are not migrated in this environment yet.";
  return error ?? "The refund did not go through. Try again.";
}

export default function AdminCommercePage() {
  /* ---- Mint a redemption code ---- */
  const [chestSku, setChestSku] = useState(CHEST_TIERS[0]?.sku ?? "");
  const [pick, setPick] = useState(CARDS[0]?.value ?? "");
  const [grants, setGrants] = useState<number[]>([]);
  const [minting, setMinting] = useState(false);
  const [minted, setMinted] = useState<MintedCode | null>(null);
  const [mintNote, setMintNote] = useState<string | null>(null);

  const tier = useMemo(
    () => CHEST_TIERS.find((t) => t.sku === chestSku) ?? null,
    [chestSku]
  );

  const addCard = () => {
    const number = Number(pick);
    if (!Number.isFinite(number)) return;
    setGrants((held) => [...held, number]);
    setMintNote(null);
  };

  const dropCard = (index: number) => {
    setGrants((held) => held.filter((_, i) => i !== index));
  };

  async function mint() {
    if (grants.length === 0) {
      setMintNote("A code must grant at least one card.");
      return;
    }
    setMinting(true);
    setMintNote(null);
    setMinted(null);
    const res = await realmFetch<{
      ok?: boolean;
      code?: string;
      redemptionId?: string;
      chest_sku?: string;
      cards?: { number: number }[];
      error?: string;
    }>("/api/admin/commerce/redemption", {
      method: "POST",
      json: {
        chest_sku: chestSku,
        /* The number alone is enough: the route resolves the slug and the
           rarity from the catalog and stores its own values, never ours. */
        cards: grants.map((number) => ({ number })),
      },
    });
    setMinting(false);
    if (res.ok && res.data?.ok && res.data.code) {
      setMinted({
        code: res.data.code,
        redemptionId: res.data.redemptionId ?? "",
        chestSku: res.data.chest_sku ?? chestSku,
        cards: res.data.cards?.length ?? grants.length,
      });
      setGrants([]);
      return;
    }
    setMintNote(redemptionRefusal(res.data?.error, res.status));
  }

  /* ---- Refund an order ---- */
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [moveMoney, setMoveMoney] = useState(true);
  const [refunding, setRefunding] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [refund, setRefund] = useState<RefundResult | null>(null);
  const [refundNote, setRefundNote] = useState<string | null>(null);

  async function issueRefund() {
    const id = orderId.trim();
    if (!id) {
      setRefundNote("Enter the order id first.");
      return;
    }
    setRefunding(true);
    setRefundNote(null);
    setRefund(null);
    const res = await realmFetch<{
      ok?: boolean;
      refunded?: boolean;
      reversed?: number;
      already_opened?: number;
      status?: string;
      error?: string;
    }>("/api/admin/commerce/refund", {
      method: "POST",
      json: {
        order_id: id,
        move_money: moveMoney,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
    });
    setRefunding(false);
    if (res.ok && res.data?.ok) {
      setRefund({
        refunded: res.data.refunded ?? true,
        reversed: res.data.reversed ?? 0,
        alreadyOpened: res.data.already_opened ?? 0,
      });
      return;
    }
    setRefundNote(refundRefusal(res.data?.error, res.data?.status, res.status));
  }

  return (
    <AdminStack>
      <AdminHeader
        title="Commerce"
        kicker="Redemption codes and refunds"
      />

      {/* ---------------------------------------------------------------
          Mint a redemption code
          --------------------------------------------------------------- */}
      <Card pad="sm">
        <SectionHeader title="Mint a redemption code" className="px-0 pt-0" />
        <p className="mt-1 text-xs text-bone-faint">
          One single-use code, printed inside a physical chest. Only its hash is
          stored, so the code below is shown once and never again.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Chest" required>
            <Select
              value={chestSku}
              onValueChange={(next) => setChestSku(next ?? "")}
              placeholder="Choose a chest"
              items={CHESTS}
              className="min-h-11 md:min-h-0"
            />
          </Field>
          <Field
            label="Card to grant"
            description={
              tier
                ? `${tier.name} deals ${tier.cardCount} cards when opened.`
                : undefined
            }
          >
            <div className="flex gap-2">
              <Select
                value={pick}
                onValueChange={(next) => setPick(next ?? "")}
                placeholder="Choose a card"
                items={CARDS}
                className="min-h-11 flex-1 md:min-h-0"
              />
              <Button
                variant="glass"
                size="md"
                className={TOUCH}
                onClick={addCard}
              >
                Add
              </Button>
            </div>
          </Field>
        </div>

        {/* What the code will grant. Every entry is a real Set One card,
            because the picker cannot offer anything else. */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
            This code grants
          </p>
          {grants.length === 0 ? (
            <p className="mt-1.5 text-xs text-bone-mut">
              Nothing yet. A code must grant at least one card.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {grants.map((number, i) => {
                const card = setOneCards.find((c) => c.number === number);
                return (
                  <li key={`${number}-${i}`}>
                    <Button
                      variant="glass"
                      size="sm"
                      className={TOUCH}
                      onClick={() => dropCard(i)}
                    >
                      No. {number} {card?.champion.name ?? ""}
                      <Icon name="close" className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="gold"
            size="md"
            className={TOUCH}
            loading={minting}
            onClick={() => void mint()}
          >
            Mint the code
          </Button>
          {grants.length > 0 ? (
            <Button
              variant="ghost"
              size="md"
              className={TOUCH}
              disabled={minting}
              onClick={() => setGrants([])}
            >
              Clear
            </Button>
          ) : null}
        </div>

        {mintNote ? (
          <div className="mt-2">
            <AdminNote>{mintNote}</AdminNote>
          </div>
        ) : null}

        {minted ? (
          <Card variant="inset" pad="sm" className="mt-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
              The code, shown once
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-steel-line bg-void px-3 py-2 font-mono text-sm text-gold">
                {minted.code}
              </code>
              <CopyButton value={minted.code} label="Copy the code" />
            </div>
            <p className="mt-2 text-xs text-bone-mut">
              Grants{" "}
              <span className="tnum text-bone">{minted.cards}</span>{" "}
              {minted.cards === 1 ? "card" : "cards"} on{" "}
              <span className="text-bone">{minted.chestSku}</span>. Copy it now:
              the realm stored only its hash, so nobody can read it back, and a
              lost code has to be minted again.
            </p>
          </Card>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------
          Refund an order
          --------------------------------------------------------------- */}
      <Card pad="sm">
        <SectionHeader title="Refund an order" className="px-0 pt-0" />
        <p className="mt-1 text-xs text-bone-faint">
          Reverses the payment and withdraws the entitlements the order granted.
          A chest the member has already opened is never clawed back: those cards
          are theirs, and the count is reported so the difference can be settled
          out of band.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Order id" required>
            <Input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              spellCheck={false}
              className="min-h-11 font-mono md:min-h-0"
            />
          </Field>
          <Field label="Reason" description="Recorded on the reversal.">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="admin_refund"
              className="min-h-11 md:min-h-0"
            />
          </Field>
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-bone">Move the money at the provider</p>
            <p className="mt-0.5 text-xs text-bone-faint">
              {moveMoney
                ? "The provider issues the reversal, then the realm records it."
                : "Off: the money was already refunded by hand, and this only records the reversal and withdraws the entitlements."}
            </p>
          </div>
          <Toggle
            checked={moveMoney}
            onCheckedChange={setMoveMoney}
            label="Move the money at the provider"
          />
        </div>

        <div className="mt-3">
          <Button
            variant="danger"
            size="md"
            className={TOUCH}
            disabled={refunding}
            onClick={() => setConfirmRefund(true)}
          >
            Refund the order
          </Button>
        </div>

        {refundNote ? (
          <div className="mt-2">
            <AdminNote>{refundNote}</AdminNote>
          </div>
        ) : null}

        {refund ? (
          <Card variant="inset" pad="sm" className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">Refunded</Badge>
              <Badge>
                <span className="tnum">{refund.reversed}</span> reversed
              </Badge>
              {refund.alreadyOpened > 0 ? (
                <Badge>
                  <span className="tnum">{refund.alreadyOpened}</span> already
                  opened
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-bone-mut">
              {refund.alreadyOpened > 0
                ? "The opened chests were left alone, because the cards inside them are already held. Settle those out of band."
                : "Nothing had been opened, so the whole order was withdrawn."}
            </p>
          </Card>
        ) : null}
      </Card>

      <ConfirmDialog
        open={confirmRefund}
        onOpenChange={setConfirmRefund}
        title="Refund this order?"
        description={
          moveMoney
            ? "The provider issues the reversal, the realm records it, and every unopened entitlement on the order is withdrawn. Anything the member has already opened stays theirs."
            : "No money moves. The realm records a refund you have already issued by hand and withdraws every unopened entitlement on the order."
        }
        confirmLabel="Refund it"
        cancelLabel="Leave the order"
        tone="danger"
        pending={refunding}
        onConfirm={() => {
          setConfirmRefund(false);
          void issueRefund();
        }}
      />
    </AdminStack>
  );
}
