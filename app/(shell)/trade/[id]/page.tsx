import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { BackButton } from "@/components/shell/back-button";
import { ShareButton } from "@/components/share/share-button";
import { readTradeSubject } from "@/lib/share/subjects";
import { shortAddress, txExplorerUrlFor } from "@/components/wallet/chains";

/* ONE VERIFIED TRADE, at its own address.
 *
 * The realm's trade tape (components/trade/realm-trades.tsx) already shows
 * every verified trade as it lands; this is the same fact given a permanent
 * address so a member can point at the one they just made rather than a
 * moment that scrolls off in fifteen seconds. `POST /api/trade/record`
 * already writes a real, idempotent row with an id; this page is the first
 * thing that reads it back out as something shareable.
 *
 * VERIFIED ONLY, and no amount, no USD value: the same restraint
 * app/api/trade/record/route.ts documents for the realm feed itself.
 * verifyTrade proves the transaction happened and that a named token
 * reached the trader's wallet; it deliberately does not check the amount a
 * client claimed. Showing a figure here that the chain has not actually
 * confirmed would be exactly the fabricated social proof that route's own
 * hardening pass exists to prevent, just one page removed from it.
 *
 * ARCHETYPE: Dossier at reading width, matching /market/[id]. Ledger
 * register: a trade is a fact to state plainly, not a moment to perform.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function read(id: string) {
  if (!UUID.test(id)) return null;
  return readTradeSubject(id);
}

const KIND_LABEL: Record<string, string> = {
  buy: "Bought",
  sell: "Sold",
  swap: "Swapped",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trade = await read(id);
  if (!trade) return { title: "The Ravenspire" };
  const verb = KIND_LABEL[trade.kind] ?? "Traded";
  return {
    title: `${verb} ${tradeHeadline(trade.kind, trade.sellSymbol, trade.buySymbol)} on The Ravenspire`,
    description:
      "A real, verified on-chain trade, signed wallet to wallet. The realm never takes custody.",
  };
}

/* What was traded, read off the two verified legs. A buy or a sell names
   only the coin that changed hands (the other leg is always the chain's
   native token); a swap names both, since neither side is the default. */
function tradeHeadline(
  kind: string,
  sellSymbol: string | null,
  buySymbol: string | null
): string {
  if (kind === "sell") return sellSymbol ?? "a coin";
  if (kind === "swap")
    return `${sellSymbol ?? "a coin"} for ${buySymbol ?? "a coin"}`;
  return buySymbol ?? "a coin";
}

export default async function TradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trade = await read(id);
  if (!trade) notFound();

  const verb = KIND_LABEL[trade.kind] ?? "Traded";
  const explorer = txExplorerUrlFor(trade.chainId, trade.txHash);
  const when = new Date(trade.createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <BackButton href="/scrying" />
        <ShareButton
          target={{ kind: "trade", id }}
          subjectHandle={trade.traderHandle}
          label="Share this trade"
        />
      </div>

      <Card pad="lg" className="flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
          A verified trade
        </p>
        <h1 className="font-display text-2xl font-semibold text-bone sm:text-3xl">
          {verb} {tradeHeadline(trade.kind, trade.sellSymbol, trade.buySymbol)}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gold">Verified on chain</Badge>
          <Badge>{trade.chainName}</Badge>
        </div>
        <p className="text-xs text-bone-faint">
          By{" "}
          {trade.traderHandle ? (
            <Link
              href={`/u/${trade.traderHandle}`}
              className="text-bone-mut underline-offset-4 hover:underline"
            >
              {trade.traderName}
            </Link>
          ) : (
            trade.traderName
          )}
          {" · "}
          {when}
        </p>
      </Card>

      <Card variant="inset" pad="lg" className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
          Transaction
        </p>
        <div className="flex items-center justify-between gap-2">
          <code className="tnum min-w-0 truncate font-mono text-xs text-bone-mut">
            {shortAddress(trade.txHash, 10, 8)}
          </code>
          {explorer ? (
            <Button
              size="sm"
              variant="glass"
              render={<a href={explorer} target="_blank" rel="noreferrer" />}
            >
              <Icon name="arrow" className="h-3.5 w-3.5" />
              View
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-bone-mut">
          Verified by reading the chain itself: the transaction succeeded and
          the named token moved into the trader&apos;s own wallet. No amount
          is shown here, since only the transaction and the token are
          confirmed on chain, never a client-claimed figure.
        </p>
      </Card>

      <Card variant="inset" pad="lg" className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-bone-faint">
          How a trade settles here
        </p>
        <p className="text-sm leading-relaxed text-bone-mut">
          Every trade is signed by the member&apos;s own wallet and settles
          wallet to wallet. The realm never takes custody of what moves.
        </p>
      </Card>

      <Button variant="gold" size="lg" block render={<Link href="/scrying" />}>
        Trade on the Scrying Glass
      </Button>
    </div>
  );
}
