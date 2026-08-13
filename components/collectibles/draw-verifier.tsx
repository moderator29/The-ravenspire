"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { RarityChip } from "@/components/ui/badge";
import type { Rarity } from "@/lib/game/champions";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { SET_ONE } from "@/lib/collectibles/set-one";
import type { PulledCard } from "@/lib/collectibles/roll";
import {
  verifyDraw,
  isDrawReference,
  type PublicOpening,
  type Verification,
} from "@/lib/collectibles/verify";

/* THE VERIFIER. Where the realm stops asking to be believed.
 *
 * THE DECISION THIS FILE EXISTS TO MAKE: the rerun happens HERE, in the
 * browser, not on a route. That was a real choice with a real cost, so the
 * reasoning is written down rather than left to be rediscovered.
 *
 * A server side verifier is simpler and it is honest: it would import
 * `rollChest`, rerun the draw, compare, and answer. It is also the realm
 * grading its own examination paper. Against a realm that is merely careless,
 * that is fine. Against a realm that has decided to cheat, it is worthless: the
 * same server that faked the draw returns "verified" for the faked draw, and
 * nothing a member can observe distinguishes the two. Every honest chest scheme
 * on the internet fails at exactly this point, by shipping a verify button that
 * asks the house whether the house was honest.
 *
 * So the algorithm ships to the browser (see `lib/collectibles/roll.ts` and
 * `lib/collectibles/sha256.ts`), and the server's role is reduced to the one
 * thing it cannot avoid: handing over the record it published. It is not asked
 * whether the numbers agree. This code, running on the member's machine, from
 * source they can read in devtools, decides that.
 *
 * The residual trust is stated on the page rather than hidden: the realm could
 * still lie about the RECORD. What stops that is the hash, which was in the
 * member's hands before the chest was opened, and which they can keep. A
 * sceptic who saved their commitment hash and then verifies against it is
 * trusting nothing at all.
 *
 * THE COST, paid deliberately: the roll had to leave `node:crypto`, and one
 * hand written SHA-256 now serves both sides. That is why `sha256.test.ts`
 * pins it against an implementation nobody here wrote.
 *
 * REAL DATA ONLY, AND THIS SURFACE IS WHERE IT BITES.
 * Nothing has ever granted a chest entitlement, `chests_live` is off, and
 * `chest_openings` is empty. So the realm has no opening to verify and this
 * page must not invent one. There is no sample draw, no illustrative seed and
 * no worked example anywhere in this file. What it offers instead is a form
 * that works the moment a real opening exists, an empty state that says plainly
 * that no chest has been opened yet, and a manual mode where the member types
 * all three inputs themselves. That last one demonstrates the function is
 * deterministic without pretending anybody pulled anything, and it is
 * deliberately reported as "recomputed" rather than "verified", because a draw
 * with nothing behind it has verified nothing.
 *
 * ARCHETYPE: Console. Dense data plus controls, compact, ornament budget zero.
 * That is the correct register and it is worth saying why, because a chest is
 * otherwise the most Forge thing in the product. The Ceremony is where a member
 * is rewarded. This is where a sceptic does arithmetic, and gold leaf on it
 * would read as the house being pleased with itself at the exact moment it is
 * supposed to be submitting to an audit.
 */

type OpeningSummary = { id: string; chest_sku: string; opened_at: string };

const CHEST_ITEMS = CHEST_TIERS.map((t) => ({ value: t.sku, label: t.name }));
const CHEST_NAME = new Map(CHEST_TIERS.map((t) => [t.sku, t.name] as const));
const CARD_BY_SLUG = new Map(
  SET_ONE.cards.map((card) => [card.champion.slug, card] as const)
);
const RARITIES = new Set(["rare", "epic", "legendary", "mythic"]);

/* A 64 character hash is unreadable in full on a phone and meaningless
   truncated to six. Both ends, generously, which is what a person actually
   compares when checking one against another. The same treatment the fairness
   panel uses, on purpose: a member moving between the two screens should be
   comparing strings that look the same shape. */
function shorten(value: string): string {
  return value.length > 26 ? `${value.slice(0, 12)}…${value.slice(-10)}` : value;
}

function CardRowLine({
  card,
  tone,
}: {
  card: PulledCard | null;
  tone: "plain" | "wrong";
}) {
  if (!card) {
    return (
      <span className="text-[11px] italic text-bone-faint">nothing in this slot</span>
    );
  }
  const known = CARD_BY_SLUG.get(card.champion_slug);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span
        className={
          tone === "wrong"
            ? "truncate text-[13px] font-semibold text-state-danger"
            : "truncate text-[13px] font-semibold text-bone"
        }
      >
        {known?.champion.name ?? card.champion_slug}
      </span>
      <span className="tnum text-[10px] text-bone-faint">#{card.card_number}</span>
      {RARITIES.has(card.rarity) ? (
        <RarityChip rarity={card.rarity as Rarity}>{card.rarity}</RarityChip>
      ) : null}
      {card.guaranteed ? (
        <span className="text-[10px] uppercase tracking-[0.14em] text-gold">
          guaranteed
        </span>
      ) : null}
    </span>
  );
}

export function DrawVerifier() {
  /* `?draw=` is how the Ceremony hands a member straight here with their own
     opening already loaded. Without it, a member who has just watched five
     cards land would have to copy a uuid out of a dialog by hand to check them,
     and nobody does that, which would make the verifier a page that exists
     rather than a page that gets used.

     useSearchParams opts this component out of static rendering, which is why
     the page wraps it in a Suspense boundary. The shell layout carries the same
     note for the same reason. */
  const params = useSearchParams();

  /* The three inputs, plus the two things a record supplies. */
  const [sku, setSku] = useState<string>(CHEST_TIERS[0].sku);
  const [serverSeed, setServerSeed] = useState("");
  const [clientSeed, setClientSeed] = useState("");
  const [nonce, setNonce] = useState("");
  const [committedHash, setCommittedHash] = useState("");

  /* The recorded opening being checked against, when there is one. */
  const [record, setRecord] = useState<PublicOpening | null>(null);
  const [reference, setReference] = useState("");
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);

  /* The realm's own openings, for a sceptic who wants to check one they had
     nothing to do with. Empty today and honestly so. */
  const [ledger, setLedger] = useState<OpeningSummary[] | null>(null);

  /* Armed only after the member asks for a run, then live.
   *
     Two behaviours in one flag, and both are wanted. Before the first run the
     panel says nothing, so a half typed seed does not sit there being called
     unusable while the member is still typing. After it, every keystroke
     recomputes, which is the single most convincing thing this page does: a
     member who has verified a real opening can change one character of the seed
     and watch the verdict turn against the realm in front of them. */
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        /* A plain fetch, not `realmFetch`. This endpoint carries no
           credentials and needs none, and using the authenticated helper here
           would quietly make the page look like it requires an account. */
        const res = await fetch("/api/chests/openings", { cache: "no-store" });
        const body = (await res.json()) as { openings?: OpeningSummary[] };
        if (!cancelled) setLedger(res.ok ? (body.openings ?? []) : []);
      } catch {
        if (!cancelled) setLedger([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchRecord = useCallback(async (raw: string) => {
    const id = raw.trim();
    if (!isDrawReference(id)) {
      setLookup("error");
      setLookupError(
        "A draw reference is the identifier of an opening, in the shape of a uuid."
      );
      return;
    }
    setLookup("loading");
    setLookupError(null);
    try {
      const res = await fetch(`/api/chests/openings/${id}`, { cache: "no-store" });
      const body = (await res.json()) as {
        opening?: PublicOpening;
        error?: string;
      };
      if (!res.ok || !body.opening) {
        setLookup("error");
        setLookupError(body.error ?? "That opening could not be read.");
        return;
      }
      const opening = body.opening;
      setRecord(opening);
      setSku(opening.chest_sku);
      setServerSeed(opening.proof.server_seed);
      setClientSeed(opening.proof.client_seed);
      setNonce(opening.proof.nonce);
      setCommittedHash(opening.proof.server_seed_hash);
      setArmed(true);
      setLookup("idle");
    } catch {
      setLookup("error");
      setLookupError("The record could not be reached.");
    }
  }, []);

  /* Arriving from the Ceremony, or from a link somebody shared. A shared
     reference is the point of the whole endpoint, so it has to survive being
     pasted into a chat window and clicked by a stranger. */
  /* Keyed on the VALUE of the parameter, never on the params object. The
     effect fetches, which sets state, which rerenders; if the dependency were
     the object and its identity changed on any of those renders, the page would
     fetch the same opening forever. Depending on a string makes that
     impossible. */
  const drawParam = params.get("draw");
  useEffect(() => {
    if (!drawParam || !isDrawReference(drawParam)) return;
    setReference(drawParam);
    void fetchRecord(drawParam);
  }, [drawParam, fetchRecord]);

  /* The whole verdict, computed here, on this machine, from these inputs.
     Nothing in this expression touches the network. */
  const verification: Verification | null = useMemo(() => {
    if (!armed) return null;
    return verifyDraw({
      chestSku: sku,
      serverSeed: serverSeed.trim(),
      clientSeed,
      nonce: nonce.trim(),
      committedHash: committedHash.trim() || null,
      recordedCards: record?.cards ?? null,
    });
  }, [armed, sku, serverSeed, clientSeed, nonce, committedHash, record]);

  const clearRecord = () => {
    setRecord(null);
    setReference("");
    setLookupError(null);
  };

  const slots = Math.max(
    verification?.cards?.length ?? 0,
    record?.cards.length ?? 0
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------------------------------------ */}
      {/* Left rail on desktop, first on mobile: find a draw, then run it. */}
      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
        <Card>
          <SectionHeader
            title="Check an opening on the record"
            hint="Anyone, no account"
          />
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            Paste the reference of any chest opening, yours or somebody
            else&rsquo;s. The realm hands over the seed it revealed and the cards
            it recorded. Your browser does the rest.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Field label="Draw reference" disabled={lookup === "loading"}>
              <Input
                value={reference}
                disabled={lookup === "loading"}
                placeholder="The opening's identifier"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="gold"
                disabled={lookup === "loading" || reference.trim() === ""}
                onClick={() => void fetchRecord(reference)}
              >
                {lookup === "loading" ? "Fetching" : "Fetch the record"}
              </Button>
              {record ? (
                <Button size="sm" onClick={clearRecord}>
                  Drop the record
                </Button>
              ) : null}
            </div>
            {lookupError ? (
              <p className="text-[11px] leading-snug text-state-danger">
                {lookupError}
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <SectionHeader title="The three inputs" hint="Rerun anything" />
          <p className="mt-1 text-xs leading-relaxed text-bone-mut">
            A chest is a pure function of these three. Change any one of them by
            a single character and the cards change completely, which is the
            point: it is why a seed committed in advance cannot be swapped for a
            kinder one afterwards.
          </p>

          <div className="mt-3 flex flex-col gap-3">
            <Field label="Chest">
              <Select
                items={CHEST_ITEMS}
                value={sku}
                onValueChange={(next) => next && setSku(next)}
              />
            </Field>
            <Field
              label="Server seed"
              description="Revealed by the realm when the chest was opened."
            >
              <Input
                value={serverSeed}
                spellCheck={false}
                autoComplete="off"
                placeholder="The revealed seed"
                onChange={(e) => setServerSeed(e.target.value)}
              />
            </Field>
            <Field
              label="Your seed"
              description="The member's own text. Empty is a real answer and means no preference."
            >
              <Input
                value={clientSeed}
                maxLength={64}
                spellCheck={false}
                autoComplete="off"
                placeholder="Anything at all"
                onChange={(e) => setClientSeed(e.target.value)}
              />
            </Field>
            <Field
              label="Draw reference"
              description="The entitlement that was spent. It is what stops one seed dealing the same chest twice."
            >
              <Input
                value={nonce}
                spellCheck={false}
                autoComplete="off"
                placeholder="The opening's identifier"
                onChange={(e) => setNonce(e.target.value)}
              />
            </Field>
            <Field
              label="Committed hash"
              description="Optional. The hash the realm published before the draw."
            >
              <Input
                value={committedHash}
                spellCheck={false}
                autoComplete="off"
                placeholder="Published before the chest was opened"
                onChange={(e) => setCommittedHash(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Button variant="gold" size="md" onClick={() => setArmed(true)}>
              <Icon name="shield" className="h-4 w-4" />
              Run the draw
            </Button>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* The verdict. Second on mobile, the whole right column on desktop. */}
      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1 lg:row-end-3">
        <Card
          tone={
            verification?.verdict === "mismatch"
              ? "danger"
              : verification?.verdict === "match"
                ? "gold"
                : "steel"
          }
        >
          {/* Polite rather than assertive: the member pressed the button, so
              they are already looking at it, and an assertive region would
              interrupt a screen reader mid word on every keystroke once the
              panel is live. */}
          <div role="status" aria-live="polite">
            {!verification ? (
              <>
                <SectionHeader title="Nothing run yet" />
                <p className="mt-1 text-xs leading-relaxed text-bone-mut">
                  Fetch an opening, or fill the three inputs yourself, then run
                  the draw. The rerun happens in this browser. The realm is not
                  asked whether it agrees.
                </p>
              </>
            ) : verification.verdict === "unusable" ? (
              <>
                <SectionHeader title="Not enough to rerun" />
                <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-bone-mut">
                  <Icon
                    name="info"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bone-faint"
                  />
                  {verification.problem}
                </p>
              </>
            ) : (
              <>
                <p
                  className={
                    verification.verdict === "mismatch"
                      ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-state-danger"
                      : "text-[11px] font-semibold uppercase tracking-[0.22em] text-gold"
                  }
                >
                  {verification.verdict === "match"
                    ? "These match"
                    : verification.verdict === "mismatch"
                      ? "These do not match"
                      : "Recomputed"}
                </p>
                <h2
                  className={
                    verification.verdict === "mismatch"
                      ? "mt-1 font-display text-xl font-semibold text-state-danger"
                      : "gold-text mt-1 font-display text-xl font-semibold"
                  }
                >
                  {verification.verdict === "match"
                    ? "The realm dealt exactly this"
                    : verification.verdict === "mismatch"
                      ? "The record and the rerun disagree"
                      : "The draw ran, and proved nothing about a chest"}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-bone-mut">
                  {verification.verdict === "match"
                    ? "Every check that could be run, ran and passed. This draw was fixed before either side could see the other's half of it."
                    : verification.verdict === "mismatch"
                      ? "At least one check failed. Read them below: a failed commitment and a failed rerun mean different things, and the difference matters."
                      : "You supplied all three inputs yourself, so there is no opening behind this. It shows the function is deterministic. It says nothing about any chest anybody pulled, and this page will not pretend otherwise."}
                </p>

                <ul className="mt-3 flex flex-col gap-2">
                  {verification.checks.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-2.5 rounded-md border border-steel-line bg-obsidian/40 px-3 py-2"
                    >
                      <Icon
                        name={
                          c.state === "pass"
                            ? "check"
                            : c.state === "fail"
                              ? "alert"
                              : "info"
                        }
                        className={
                          c.state === "pass"
                            ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-gold"
                            : c.state === "fail"
                              ? "mt-0.5 h-3.5 w-3.5 shrink-0 text-state-danger"
                              : "mt-0.5 h-3.5 w-3.5 shrink-0 text-bone-faint"
                        }
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span
                          className={
                            c.state === "fail"
                              ? "text-xs font-semibold text-state-danger"
                              : c.state === "absent"
                                ? "text-xs font-semibold text-bone-mut"
                                : "text-xs font-semibold text-bone"
                          }
                        >
                          {c.label}
                        </span>
                        <span className="text-[11px] leading-relaxed text-bone-mut">
                          {c.detail}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                {verification.computedHash ? (
                  <p className="tnum mt-3 break-all font-mono text-[10px] text-bone-faint">
                    sha256 of the seed you gave: {verification.computedHash}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Card>

        {verification?.cards ? (
          <Card>
            <SectionHeader
              title="The cards"
              hint={
                record
                  ? "Rerun beside the record"
                  : "Rerun only, nothing to compare"
              }
            />
            {record ? (
              <p className="mt-1 text-xs leading-relaxed text-bone-mut">
                Left is what these three inputs deal on your machine. Right is
                what the realm recorded. Slot order is part of the claim: the
                guarantee always lands last.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-bone-mut">
                Dealt by the same function the realm runs, from the inputs you
                gave it. There is no opening behind these, so there is nothing
                on the right.
              </p>
            )}

            <ol className="mt-3 flex flex-col gap-1.5">
              {Array.from({ length: slots }, (_, i) => {
                const mine = verification.cards?.[i] ?? null;
                const theirs = record?.cards[i] ?? null;
                const differs =
                  record !== null &&
                  (mine?.champion_slug !== theirs?.champion_slug ||
                    mine?.card_number !== theirs?.card_number ||
                    (mine?.guaranteed === true) !== (theirs?.guaranteed === true));
                return (
                  <li
                    key={i}
                    className={
                      differs
                        ? "flex flex-col gap-1 rounded-md border border-state-danger/50 bg-obsidian/50 px-3 py-2 sm:grid sm:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                        : "flex flex-col gap-1 rounded-md border border-steel-line bg-obsidian/40 px-3 py-2 sm:grid sm:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3"
                    }
                  >
                    <span className="tnum text-[10px] font-semibold text-bone-faint">
                      {i + 1}
                    </span>
                    <CardRowLine card={mine} tone="plain" />
                    {record ? (
                      <CardRowLine card={theirs} tone={differs ? "wrong" : "plain"} />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Card>
        ) : null}
      </div>

      {/* ------------------------------------------------------------ */}
      {/* The realm's openings. Last on mobile, under the form on desktop. */}
      <Card className="lg:col-start-1 lg:row-start-2">
        <SectionHeader title="Openings on the record" hint="Pick any one" />
        <p className="mt-1 text-xs leading-relaxed text-bone-mut">
          Every settled opening in the realm, newest first, with no member
          attached to any of them. Checking your own chest proves the realm was
          honest with you. Checking a stranger&rsquo;s is what proves it was
          honest with everybody.
        </p>

        {ledger === null ? (
          <p className="mt-3 text-xs text-bone-faint">Reading the record</p>
        ) : ledger.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-bone-faint">
            <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            {/* The honest answer, and the only correct one today. No specimen
                opening, no worked example, no invented reference. */}
            No chest has been opened in the realm yet. The chests are still
            sealed and nothing has granted an entitlement, so there is nothing
            here to check. The moment a real chest is opened its reference
            appears in this list, for anybody.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {ledger.map((o) => (
              <li key={o.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  pad="sm"
                  className="w-full justify-between gap-3 border border-steel-line text-left"
                  onClick={() => {
                    setReference(o.id);
                    void fetchRecord(o.id);
                  }}
                >
                  <span className="min-w-0 truncate text-[11px] font-semibold text-bone">
                    {CHEST_NAME.get(o.chest_sku) ?? o.chest_sku}
                  </span>
                  <span className="tnum shrink-0 font-mono text-[10px] text-bone-faint">
                    {shorten(o.id)}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
