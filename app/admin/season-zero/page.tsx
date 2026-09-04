"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useDelayedLoading } from "@/components/ui/skeleton";
import { formatEth } from "@/lib/season-zero";
import {
  addressExplorerUrlFor,
  evmChainById,
  shortAddress,
  txExplorerUrlFor,
} from "@/components/wallet/chains";
import {
  AdminError,
  AdminHeader,
  AdminNote,
  AdminStack,
  Board,
  BoardCard,
  BoardSkeleton,
  SealedChamber,
  StatSkeleton,
  StatTile,
  TOUCH,
} from "@/app/admin/ui";

/* SEASON ZERO, at the council table.
 *
 * The founding round has been running since September 1 and the founder had no
 * way to see who backed it. The public page shows a bar; this chamber shows the
 * roll behind the bar: every contribution, the member it belongs to, the wallet
 * it came from, the transaction that carries it, and whether it still counts.
 *
 * ARCHETYPE: Console above a Board, Ledger register, ornament budget zero. This
 * is somebody's money read back to them. Nothing here celebrates, nothing
 * glows, and the only motion is the live dot on a round that is genuinely open.
 *
 * REAL DATA ONLY, and here that is the whole point: every figure is a sum over
 * chain-verified rows served by /api/admin/season-zero, which derives the raise
 * by the same rule the public aggregate uses. An empty round reads as zero
 * rather than as a placeholder.
 *
 * THE REFUND CONTROL RECORDS, IT DOES NOT SEND. The round is non-custodial, so
 * the ETH leaves the treasury wallet by the founder's own hand. The control
 * behind the confirm step marks the row refunded so the raise stops counting
 * it. Its copy says exactly that, in the dialog and on the row, because a
 * control called "Refund" on a screen full of other people's money would be
 * read as one that moves it.
 */

interface Contribution {
  id: string;
  handle: string | null;
  displayName: string | null;
  walletAddress: string;
  chainId: number;
  txHash: string;
  amountWei: string;
  rsp: string;
  status: "verified" | "refunded";
  createdAt: string | null;
}

interface SeasonZeroAdmin {
  phase: "upcoming" | "live" | "ended";
  raisedWei: string;
  backerCount: number;
  rspAllocated: string;
  softcapMet: boolean;
  softcapPct: number;
  hardcapPct: number;
  verified: { count: number; backerCount: number; totalWei: string };
  refunded: { count: number; backerCount: number; totalWei: string };
  contributions: Contribution[];
  rowCount: number;
  listLimit: number;
  round: {
    startsAt: string;
    endsAt: string;
    softcapEth: number;
    hardcapEth: number;
    supplyPct: number;
    rspPerEth: number;
    rspAllocation: number;
    minContributionEth: number;
    treasury: string;
    /* `verifiable` is whether this deployment holds an RPC endpoint for the
       chain. Without one the server cannot read a receipt, so the public page
       withdraws the treasury address there and contributions are paused. */
    chains: {
      id: number;
      name: string;
      primary: boolean;
      verifiable: boolean;
    }[];
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toWei(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

function ethText(raw: string): string {
  return formatEth(toWei(raw), 4);
}

function rspText(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : raw;
}

function dayText(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function memberName(c: Contribution): string {
  return c.displayName?.trim() || (c.handle ? `@${c.handle}` : "Unknown member");
}

function chainName(chainId: number): string {
  return evmChainById(chainId)?.name ?? `Chain ${chainId}`;
}

/* Whole days between now and an instant, rounded up, floored at zero. */
function daysUntil(iso: string): number {
  const ms = Date.parse(iso) - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/* The realm's words for what the refund route answers with. */
function refundRefusal(error: string | undefined, status: number): string {
  if (status === 429) return "Too many refunds recorded this hour. Wait, then try again.";
  if (error === "already_refunded")
    return "That contribution is already marked refunded. Nothing changed.";
  if (error === "contribution_not_found")
    return "No contribution carries that id. Read the roll again.";
  if (error === "bad_refund_tx_hash")
    return "That is not a transaction hash. Leave it blank or paste the full 0x hash.";
  if (error === "season zero is not migrated yet")
    return "The Season Zero table is not migrated in this environment yet.";
  return error ?? "The refund was not recorded. Try again.";
}

/* ----- The phase band: live, upcoming, or closed ----- */

function PhaseBand({ data }: { data: SeasonZeroAdmin }) {
  /* The phase itself is the server's reading, so a browser with a wrong clock
     cannot open or close the round on the founder's screen. The countdown
     beside it is the only thing computed here, and it only ever describes a
     window the server has already put us inside. */
  if (data.phase === "live") {
    const left = daysUntil(data.round.endsAt);
    return (
      <Card pad="sm" variant="raised">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold"
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              The round is live
            </span>
          </span>
          <span className="tnum text-xs text-bone-mut">
            {left === 0 ? "Closes today" : `${left} ${left === 1 ? "day" : "days"} left`}
          </span>
        </div>
        <p className="mt-1.5 text-xs text-bone-faint">
          Closes September 20, 23:59 UTC, or early at the hardcap of{" "}
          {data.round.hardcapEth} ETH.
        </p>
      </Card>
    );
  }

  if (data.phase === "upcoming") {
    const until = daysUntil(data.round.startsAt);
    return (
      <Card pad="sm" variant="raised">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
          The round has not opened
        </p>
        <p className="tnum mt-1.5 text-xs text-bone-mut">
          Opens September 1, 00:00 UTC,{" "}
          {until === 0 ? "today" : `${until} ${until === 1 ? "day" : "days"} away`}.
          Contributions cannot be recorded before it does.
        </p>
      </Card>
    );
  }

  return (
    <Card pad="sm" variant="raised">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone-faint">
        The round has closed
      </p>
      <p className="mt-1.5 text-xs text-bone-mut">
        Closed September 20, 23:59 UTC. The figures below are final.
      </p>
    </Card>
  );
}

/* "Base", "Base and Ethereum", "Base, Ethereum and Optimism". */
function nameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/* ----- Chain verification: whether the round can check its own claims -----
 *
 * verifyContribution needs an RPC endpoint, and there is deliberately no public
 * fallback. Without one the server can only ever answer "pending", so the
 * public round page withdraws the treasury address on that chain and pauses
 * contributions rather than inviting a transfer it cannot read. That is the
 * correct behaviour and it is also completely silent: from here it looks like a
 * quiet week. This line is how the council sees it on the first screen instead.
 */
function VerificationLine({ data }: { data: SeasonZeroAdmin }) {
  const chains = data.round.chains;
  const dark = chains.filter((c) => !c.verifiable);

  if (dark.length === 0) {
    return (
      <Card pad="sm" variant="raised">
        <p className="text-xs text-bone-mut">
          <span className="font-semibold text-gold">Chain verification is on.</span>{" "}
          {nameList(chains.map((c) => c.name))} can each be read from this
          deployment, so a contribution is checked against the chain before it is
          recorded.
        </p>
      </Card>
    );
  }

  const all = dark.length === chains.length;
  const lit = chains.filter((c) => c.verifiable);
  return (
    <Card pad="sm" variant="raised" tone="ember">
      <p className="text-sm font-semibold text-state-warning">
        {all
          ? "No chain can be verified from this deployment."
          : `${nameList(dark.map((c) => c.name))} cannot be verified from this deployment.`}
      </p>
      <p className="mt-1 text-xs text-bone-mut">
        {all
          ? "The public round page has withdrawn the treasury address and contributions are paused, because a transfer the server cannot read can never be recorded."
          : `Contributions on ${nameList(dark.map((c) => c.name))} are paused on the public round page. ${nameList(
              lit.map((c) => c.name)
            )} ${lit.length === 1 ? "is" : "are"} unaffected.`}{" "}
        The fix is setting ALCHEMY_API_KEY, or EVM_RPC_URLS, in the deployment
        environment. Money already sent is not lost: registration records a
        contribution as soon as the chain can be read again.
      </p>
    </Card>
  );
}

/* ----- The softcap, stated plainly ----- */

function SoftcapLine({ data }: { data: SeasonZeroAdmin }) {
  const closed = data.phase === "ended";
  return (
    <Card pad="sm" variant="raised" tone={data.softcapMet ? "gold" : "steel"}>
      <p className="font-display text-sm font-semibold text-bone">
        {data.softcapMet
          ? `The softcap is met. ${ethText(data.raisedWei)} ETH against ${data.round.softcapEth} ETH.`
          : `The softcap is not met. ${ethText(data.raisedWei)} ETH against ${data.round.softcapEth} ETH.`}
      </p>
      <p className="mt-1 text-xs text-bone-mut">
        {data.softcapMet
          ? "The round stands. Allocations are delivered at the token generation event."
          : closed
            ? "The round closed below the softcap, so every contribution is due back to the wallet that sent it."
            : "Refunds due if the round closes here: every contribution goes back to the wallet that sent it."}
      </p>
    </Card>
  );
}

export default function AdminSeasonZeroPage() {
  const [data, setData] = useState<SeasonZeroAdmin | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const showSkeleton = useDelayedLoading(status === "loading", 300);

  /* The refund step. One row at a time, always behind this dialog. */
  const [target, setTarget] = useState<Contribution | null>(null);
  const [refundHash, setRefundHash] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /* `silent` keeps the roll on screen while it is re-read after a refund. A
     reload that blanks the board for a moment reads as the row having gone
     somewhere, which on a screen about money is the wrong thing to imply. */
  const load = useCallback((silent = false) => {
    if (!silent) setStatus("loading");
    void realmFetch<SeasonZeroAdmin>("/api/admin/season-zero").then((res) => {
      if (res.status === 401 || res.status === 403) {
        setStatus("sealed");
      } else if (res.ok && res.data) {
        setData(res.data);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openRefund(c: Contribution) {
    setTarget(c);
    setRefundHash("");
    setNote(null);
    setDone(null);
  }

  async function recordRefund() {
    if (!target) return;
    setRefunding(true);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; error?: string }>(
      "/api/admin/season-zero/refund",
      {
        method: "POST",
        json: {
          id: target.id,
          ...(refundHash.trim() ? { refundTxHash: refundHash.trim() } : {}),
        },
      }
    );
    setRefunding(false);
    if (res.ok && res.data?.ok) {
      setDone(
        `Recorded a refund of ${ethText(target.amountWei)} ETH to ${shortAddress(target.walletAddress)}. The raise no longer counts it.`
      );
      setTarget(null);
      load(true);
      return;
    }
    setNote(refundRefusal(res.data?.error, res.status));
  }

  if (status === "sealed") return <SealedChamber />;

  if (status === "error") {
    return (
      <AdminStack>
        <AdminHeader title="Season Zero" kicker="The founding round" />
        <AdminError
          body="The round could not be read. The archives may be resting."
          onRetry={() => load()}
        />
      </AdminStack>
    );
  }

  const tiles = data
    ? [
        { label: "Raised", value: `${ethText(data.raisedWei)} ETH`, icon: "wallet" },
        { label: "Backers", value: data.backerCount.toLocaleString("en-US"), icon: "user" },
        {
          label: `Softcap, ${data.round.softcapEth} ETH`,
          value: `${data.softcapPct.toFixed(1)}%`,
          icon: "target",
        },
        {
          label: `Hardcap, ${data.round.hardcapEth} ETH`,
          value: `${data.hardcapPct.toFixed(1)}%`,
          icon: "flag",
        },
        { label: "$RSP allocated", value: rspText(data.rspAllocated), icon: "coin" },
      ]
    : [];

  const clipped = data ? data.rowCount > data.contributions.length : false;

  return (
    <AdminStack>
      <AdminHeader
        title="Season Zero"
        kicker="The founding round, September 1 to 20, 2026"
      />

      {data ? <PhaseBand data={data} /> : null}

      {/* High, and above the board: a round that cannot verify a contribution
          is not a round, and the failure is otherwise silent. */}
      {data ? <VerificationLine data={data} /> : null}

      <section aria-label="The raise" className="flex flex-col gap-3 md:gap-2">
        {showSkeleton ? (
          <StatSkeleton count={5} />
        ) : status === "loading" ? null : (
          <div className="grid grid-cols-2 gap-3 md:gap-2 lg:grid-cols-5">
            {tiles.map((t) => (
              <StatTile key={t.label} icon={t.icon} value={t.value} label={t.label} />
            ))}
          </div>
        )}
      </section>

      {data ? <SoftcapLine data={data} /> : null}

      {done ? <AdminNote tone="gold">{done}</AdminNote> : null}

      <section aria-label="Contributions" className="flex flex-col gap-3 md:gap-2">
        <SectionHeader
          title="Contributions"
          hint={
            data
              ? `${data.verified.count} verified, ${data.refunded.count} refunded`
              : undefined
          }
        />

        {showSkeleton ? (
          <BoardSkeleton rows={6} columns={6} />
        ) : status === "loading" ? null : data && data.contributions.length > 0 ? (
          <Board
            label="Season Zero contributions, newest first"
            rows={data.contributions}
            rowKey={(c) => c.id}
            muted={(c) => c.status === "refunded"}
            columns={[
              {
                key: "member",
                header: "Member",
                className: "whitespace-nowrap font-semibold text-bone",
                cell: (c) =>
                  c.handle ? (
                    <Link
                      href={`/u/${c.handle}`}
                      className="rounded-md text-bone underline decoration-steel-line underline-offset-2 hover:text-gold"
                    >
                      {memberName(c)}
                    </Link>
                  ) : (
                    memberName(c)
                  ),
              },
              {
                key: "wallet",
                header: "Wallet",
                className: "tnum whitespace-nowrap",
                cell: (c) => <WalletCell c={c} />,
              },
              {
                key: "chain",
                header: "Chain",
                className: "whitespace-nowrap",
                cell: (c) => chainName(c.chainId),
              },
              {
                key: "amount",
                header: "Amount",
                numeric: true,
                className: "whitespace-nowrap text-bone",
                cell: (c) => `${ethText(c.amountWei)} ETH`,
              },
              {
                key: "rsp",
                header: "$RSP",
                numeric: true,
                className: "whitespace-nowrap",
                cell: (c) => rspText(c.rsp),
              },
              {
                key: "when",
                header: "Recorded",
                numeric: true,
                className: "whitespace-nowrap text-bone-faint",
                cell: (c) => dayText(c.createdAt),
              },
              {
                key: "tx",
                header: "Transaction",
                className: "tnum whitespace-nowrap",
                cell: (c) => <TxCell c={c} />,
              },
              {
                key: "status",
                header: "Status",
                cell: (c) =>
                  c.status === "refunded" ? (
                    <Badge>Refunded</Badge>
                  ) : (
                    <Badge variant="gold">Verified</Badge>
                  ),
              },
              {
                key: "refund",
                header: "Refund",
                cell: (c) =>
                  c.status === "refunded" ? (
                    <span className="text-bone-faint">Recorded</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={TOUCH}
                      onClick={() => openRefund(c)}
                    >
                      Record refund
                    </Button>
                  ),
              },
            ]}
            card={(c) => (
              <BoardCard
                title={memberName(c)}
                subtitle={`${chainName(c.chainId)}, ${dayText(c.createdAt)}`}
                trailing={
                  <span className="text-sm text-bone">{ethText(c.amountWei)} ETH</span>
                }
                badges={
                  c.status === "refunded" ? (
                    <Badge>Refunded</Badge>
                  ) : (
                    <Badge variant="gold">Verified</Badge>
                  )
                }
                stats={[
                  { label: "$RSP", value: rspText(c.rsp) },
                  { label: "Wallet", value: <WalletCell c={c} /> },
                  { label: "Transaction", value: <TxCell c={c} /> },
                  {
                    label: "Keep",
                    value: c.handle ? (
                      <Link href={`/u/${c.handle}`} className="rounded-md text-gold">
                        @{c.handle}
                      </Link>
                    ) : (
                      "none"
                    ),
                  },
                ]}
                actions={
                  c.status === "verified" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={TOUCH}
                      onClick={() => openRefund(c)}
                    >
                      Record refund
                    </Button>
                  ) : null
                }
              />
            )}
          />
        ) : (
          <Card pad="lg">
            <EmptyState
              icon="wallet"
              title="No contributions yet"
              body="Verified contributions appear here, newest first, the moment the server has read one off the chain."
            />
          </Card>
        )}

        {clipped && data ? (
          <AdminNote>
            Showing the {data.contributions.length} newest of {data.rowCount}{" "}
            contributions. The raise above counts every row, not only the ones
            listed.
          </AdminNote>
        ) : null}

        <AdminNote tone="gold">
          The raise is the sum of every contribution the server has verified
          against the chain, in wei, converted for display only. A refunded row
          is money already returned to its sending wallet, so it is excluded
          from the raise, the backer count and the $RSP allocated. A transaction
          can only ever count once: the table is unique on chain and transaction
          hash, so the same transfer cannot be recorded twice however many times
          it is submitted. These are the same figures the public round page
          shows, derived by the same rule.
        </AdminNote>

        {data ? (
          <p className="tnum break-all text-[11px] text-bone-faint">
            Every verified row paid the Season Zero treasury at{" "}
            {data.round.treasury}.
          </p>
        ) : null}
      </section>

      {/* The refund step. Portals to document.body, per house rule 16. */}
      <Modal
        open={target !== null}
        onOpenChange={(next) => {
          if (!next && !refunding) setTarget(null);
        }}
        size="md"
        title="Record a refund"
        description="This writes down a refund you have already sent. It does not move any money."
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={refunding}
              onClick={() => setTarget(null)}
            >
              Leave it
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={refunding}
              onClick={() => void recordRefund()}
            >
              Record the refund
            </Button>
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-3">
            <Card variant="inset" pad="sm">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <dt className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                  Member
                </dt>
                <dd className="text-right text-xs text-bone">{memberName(target)}</dd>
                <dt className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                  Amount
                </dt>
                <dd className="tnum text-right text-xs text-bone">
                  {ethText(target.amountWei)} ETH
                </dd>
                <dt className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                  Sending wallet
                </dt>
                <dd className="tnum text-right text-xs text-bone">
                  {shortAddress(target.walletAddress)}
                </dd>
                <dt className="text-[11px] uppercase tracking-[0.16em] text-bone-faint">
                  Chain
                </dt>
                <dd className="text-right text-xs text-bone">
                  {chainName(target.chainId)}
                </dd>
              </dl>
            </Card>

            <p className="text-xs text-bone-mut">
              The round is non-custodial, so the ETH sits in the treasury wallet
              and only its keyholder can send it back. Send{" "}
              <span className="tnum text-bone">{ethText(target.amountWei)} ETH</span>{" "}
              to{" "}
              <span className="tnum text-bone">
                {shortAddress(target.walletAddress)}
              </span>{" "}
              first, then record it here. Recording it marks the contribution
              refunded and removes it from the raise, the backer count and the
              $RSP allocated. It cannot be undone from this screen.
            </p>

            <Field
              label="Refund transaction hash"
              description="Optional. Stored in the council's audit log as the proof the money went back."
            >
              <Input
                value={refundHash}
                onChange={(e) => setRefundHash(e.target.value)}
                placeholder="0x..."
                spellCheck={false}
                className="min-h-11 font-mono md:min-h-0"
              />
            </Field>

            {note ? <AdminNote>{note}</AdminNote> : null}
          </div>
        ) : null}
      </Modal>
    </AdminStack>
  );
}

/* ----- Two cells that carry an explorer link, shared by the table and the
   card list so a phone and a desktop never disagree about what a row says. */

function WalletCell({ c }: { c: Contribution }) {
  const href = addressExplorerUrlFor(c.chainId, c.walletAddress);
  const short = shortAddress(c.walletAddress);
  if (!href) return <span className="text-bone-mut">{short}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md text-bone-mut underline decoration-steel-line underline-offset-2 hover:text-gold"
    >
      {short}
    </a>
  );
}

function TxCell({ c }: { c: Contribution }) {
  const href = txExplorerUrlFor(c.chainId, c.txHash);
  const short = shortAddress(c.txHash, 8, 6);
  if (!href) return <span className="text-bone-mut">{short}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md text-bone-mut underline decoration-steel-line underline-offset-2 hover:text-gold"
      aria-label={`Open transaction ${c.txHash} on the ${chainName(c.chainId)} explorer`}
    >
      {short}
    </a>
  );
}
