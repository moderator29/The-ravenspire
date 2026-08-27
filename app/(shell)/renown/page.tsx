"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";
import { crests, CrestRoundel } from "@/components/brand/crests";
import { Badge, RarityChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { Meter } from "@/components/ui/meter";
import { SegmentedControl } from "@/components/ui/tabs";
import { BackButton } from "@/components/shell/back-button";
import { ClaimButton } from "@/components/collectibles/claim-button";

/* Crests and Renown.

   Archetype: Dossier. Your standing first, then the collection.

   The register split this page was missing, and it was the clearest case of
   AGENTS.md rule 21 in the product. Every one of the ten crest cards carried
   `rarity-frame`, which is a coloured border plus a 24px coloured glow.
   Measured on a 390x844 phone, ten glowing boxes on one screen, eight of them
   for crests nobody has earned and two of them for crests that do not exist in
   the realm yet. A locked crest glowed exactly as brightly as an earned one,
   so the glow carried no information at all, and the screen it sat on was the
   one screen in the product whose entire job is to say what you have earned.

   So the glow is earned now, literally. A crest you hold is the Forge
   register: the rarity frame, its light, the roundel in full gold and a gold
   Earned badge. Everything else is a flat Ledger plate with a dimmed roundel.
   The difference between the two is the page's whole message, and it is now
   visible from across the room.

   Rarity keeps its meaning on the chip, which is where it was already legible.
   That chip is the `RarityChip` primitive rather than the hand rolled
   `.rarity-chip` class this page used to reach for. The class colours its text
   with `--rarity`, and for mythic that resolves to `--blood`, a fill only hue
   that measures 1.87:1 as text, so the "Blood of the Dragon" chip has been
   failing rule 11 on this screen. The primitive uses the `-text` twin.

   The segmented control is the pattern section 3 of the design system names
   for this exact page ("Renown, earned vs locked crests"), and the page had no
   tabs at all. Real data only: nothing is counted as earned until the read
   lands, so a signed out member sees an honest empty Earned tab rather than a
   collection that looks like theirs. */

interface MeProfile {
  id: string;
  /* The handle is here for one reason: an earned crest gets its own shareable
     address at /u/<handle>/crest/<slug>, and this page is where a member finds
     out they have earned one. A crest nobody can link to is a trophy in a
     drawer. */
  handle: string | null;
  tier: string;
  renown: number;
}

/* What the realm says about the mint, and what the member has already carried
   on-chain. Both arrive from GET /api/claims in one read, because a claim
   control that renders before the realm knows whether it can mint is a control
   that promises something it cannot do. */
interface ClaimState {
  status: string;
  item_slug: string;
  subject_kind: string;
  tx_hash: string | null;
}

interface MintState {
  open: boolean;
  explorer?: string;
}

const TIERS = [
  { slug: "smallfolk", name: "Smallfolk", min: 0 },
  { slug: "squire", name: "Squire", min: 100 },
  { slug: "knight", name: "Knight", min: 400 },
  { slug: "lord", name: "Lord / Lady", min: 1200 },
  { slug: "warden", name: "Warden", min: 3000 },
  { slug: "hand", name: "Hand", min: 7000 },
  { slug: "king", name: "King / Queen", min: 15000 },
];

type Filter = "all" | "earned" | "locked";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "earned", label: "Earned" },
  { value: "locked", label: "Locked" },
];

export default function RenownPage() {
  const { ready, authenticated } = useRealmAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [earned, setEarned] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [mint, setMint] = useState<MintState | null>(null);
  const [claims, setClaims] = useState<Map<string, ClaimState>>(new Map());
  /* Your standing arrives from the server; the crest catalogue does not, so
     only the standing has anything to wait for. The tier ladder and the crest
     plates render immediately either way, which is why there is one skeleton on
     this page rather than a page of them. Gated behind the delay, so a read
     that lands quickly simply appears.

     `read` records that the answer arrived, whatever the answer was. Waiting on
     `me` alone would leave the skeleton pulsing forever for anybody the read
     came back empty for. */
  const [read, setRead] = useState(false);
  const showStandingSkeleton = useDelayedLoading(
    ready && authenticated && !read
  );

  /* Read the claim state once per visit. Refreshed by the claim control's own
     callback rather than by polling: the only thing that changes it is the
     member claiming something on this very screen. */
  const loadClaims = useCallback(async () => {
    const res = await realmFetch<{ claims?: ClaimState[]; mint?: MintState }>(
      "/api/claims"
    );
    if (!res.ok) return;
    setMint(res.data?.mint ?? { open: false });
    const next = new Map<string, ClaimState>();
    for (const claim of res.data?.claims ?? []) {
      if (claim.subject_kind !== "crest") continue;
      /* A settled claim outranks an open one, and an open one outranks the
         expired history a slug can accumulate. */
      const held = next.get(claim.item_slug);
      if (held?.status === "minted") continue;
      next.set(claim.item_slug, claim);
    }
    setClaims(next);
  }, []);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void loadClaims();
  }, [ready, authenticated, loadClaims]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    void (async () => {
      const res = await realmFetch<{ profile?: MeProfile }>("/api/me", {
        method: "POST",
      });
      const profile = res.data?.profile ?? null;
      setMe(profile);
      setRead(true);
      if (profile) {
        const db = createClient();
        const { data } = await db
          .from("user_crests")
          .select("crest_slug")
          .eq("profile_id", profile.id);
        setEarned(
          new Set((data ?? []).map((r) => r.crest_slug as string))
        );
      }
    })();
  }, [ready, authenticated]);

  const tierIndex = me
    ? Math.max(
        0,
        TIERS.findIndex((t) => t.slug === me.tier)
      )
    : -1;
  const nextTier = tierIndex >= 0 ? TIERS[tierIndex + 1] : undefined;

  /* Only ever what the server actually returned. Before that read lands, and
     for anyone not signed in, nothing is earned, because nothing is known. */
  const held = useMemo(() => earned ?? new Set<string>(), [earned]);
  const shown = useMemo(
    () =>
      crests.filter((c) =>
        filter === "all"
          ? true
          : filter === "earned"
            ? held.has(c.slug)
            : !held.has(c.slug)
      ),
    [filter, held]
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6 md:gap-3 lg:max-w-4xl">
      <div className="flex">
        <BackButton />
      </div>

      <div>
        <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
          Crests and Renown
        </h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-bone-faint">
          Standing · badges of deed
        </p>
      </div>

      {/* The tier ladder. On a phone it is a rail, so it is allowed to run past
          the edge: it scrolls, and the page does not.

          On a mouse it is not a rail at all. The seven tiers need 895px and the
          column measured 672px at both 1024 and 1440, so Hand and King / Queen,
          the two tiers the whole ladder is climbing towards, sat off the right
          of a track with no visible scrollbar while a quarter of the page was
          empty beside it. That is the phone layout unresized, which rule 15
          forbids. From `lg` the ladder wraps instead of scrolling and every
          tier is on screen. */}
      <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4 lg:mx-0 lg:overflow-x-visible lg:px-0">
        <div className="flex w-max gap-2 pb-1 lg:w-auto lg:flex-wrap">
          {TIERS.map((t, i) => {
            const isMine = me !== null && i === tierIndex;
            return (
              <Card
                key={t.slug}
                variant={isMine ? "warm" : "raised"}
                {...(isMine ? { tone: "gold" as const } : {})}
                radius="lg"
                pad="none"
                className="shrink-0 px-4 py-3 text-center"
              >
                <p
                  className={`font-display text-sm font-semibold ${
                    isMine ? "text-gold-bright" : "text-bone"
                  }`}
                >
                  {t.name}
                </p>
                <p className="tnum mt-0.5 text-[11px] text-bone-faint">
                  {t.min.toLocaleString()}+ Renown
                </p>
                {isMine ? (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-gold">
                    Your tier
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      {me ? (
        <Card>
          {nextTier ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-bone-mut">
                  Road to{" "}
                  <span className="font-semibold text-bone">
                    {nextTier.name}
                  </span>
                </p>
                <p className="tnum text-xs text-bone-faint">
                  {me.renown.toLocaleString()} / {nextTier.min.toLocaleString()}{" "}
                  Renown
                </p>
              </div>
              {/* The bar is band relative: it fills across the current tier,
                  not from zero, which is why it is fed the offsets rather than
                  the raw totals. No `label`, deliberately. The figure is
                  already written directly above it, and the old `role="img"`
                  announced "1,300 of 1,900 Renown" over a bar that was in fact
                  drawing 300 of 900, so a screen reader heard a number the
                  shape did not mean. One reading of the value, in the text. */}
              <Meter
                size="md"
                className="mt-2"
                value={me.renown - TIERS[tierIndex].min}
                max={nextTier.min - TIERS[tierIndex].min}
              />
            </>
          ) : (
            <p className="text-sm text-bone-mut">
              You stand at the summit. There is no higher tier to climb.
            </p>
          )}
        </Card>
      ) : showStandingSkeleton ? (
        /* Shaped like the panel that is arriving: the road line, the figure
           beside it, and the bar under both. */
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton radius="sm" className="h-3.5 w-32" />
            <Skeleton radius="sm" className="h-3 w-24" />
          </div>
          <Skeleton radius="sm" className="mt-3 h-2 w-full" />
        </Card>
      ) : null}

      {authenticated ? <SeasonRecord /> : null}

      {/* The promise is a sentence, so it is a paragraph. Passed as the
          header's `hint` it competed with the heading for the same row and
          wrapped "The Crests" onto two lines at 390px: that slot is sized for
          a count, not for prose. */}
      <SectionHeader title="The Crests" />
      {/* The line has to stay true in both states of the mint. A crest that a
          member carries to their own wallet is still earned, still unbuyable,
          and still unsellable, because the crest contract refuses every
          transfer after the mint. What it stops being is only ours. */}
      <p className="-mt-1 px-1 text-xs text-bone-faint">
        Earned, never bought. Bound to you, never for sale.
      </p>

      {/* Three mutually exclusive views of the same collection, switched in
          place, which is the segmented control case. */}
      <SegmentedControl
        label="Crests"
        block
        value={filter}
        onValueChange={(next) => setFilter(next as Filter)}
        items={FILTERS}
      />

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon3d="trophy"
            title={
              filter === "earned"
                ? "No crests to your name yet"
                : "Nothing left to claim here"
            }
            body={
              filter === "earned"
                ? "Crests are earned by deed, never bought. Enter the realm and the first will be struck against your name."
                : "Every crest in the realm is already yours."
            }
            {...(filter === "earned" && !authenticated
              ? {
                  action: (
                    <Button
                      variant="gold"
                      size="md"
                      render={<Link href="/signin" />}
                    >
                      Enter the realm
                    </Button>
                  ),
                }
              : {})}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => {
            const isEarned = held.has(c.slug);
            return (
              <li key={c.slug} className="flex">
                {/* Forge only when it is actually yours. */}
                <Card
                  variant={isEarned ? "warm" : "raised"}
                  radius="lg"
                  pad="md"
                  className={`flex w-full flex-col items-center text-center ${
                    isEarned ? `rarity-${c.rarity} rarity-frame` : ""
                  }`}
                >
                  <CrestRoundel
                    icon={c.icon}
                    className="h-16 w-16"
                    dim={!isEarned}
                  />
                  <p
                    className={`mt-2.5 font-display text-[15px] font-semibold ${
                      isEarned ? "text-bone" : "text-bone-mut"
                    }`}
                  >
                    {c.name}
                  </p>
                  <p className="text-[11px] text-bone-faint">{c.plain}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    <RarityChip rarity={c.rarity} />
                    {isEarned ? (
                      <Badge variant="gold" icon="medal">
                        Earned
                      </Badge>
                    ) : c.status === "locked" ? (
                      <Badge icon="lock">Not yet live</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-bone-mut">
                    {c.earn}
                  </p>
                  {/* The ownership loop, on the only collectible in the realm
                      anybody holds today. It appears for a crest you have
                      earned, and only once the realm can actually mint: while
                      the contracts are unbuilt `mint.open` is false and this
                      whole block is absent rather than present and disabled,
                      because a dead control is a promise the screen cannot
                      keep. */}
                  {/* A crest you hold has an address of its own, and this is
                      the only place in the realm you would go looking for it.
                      Absent for a crest you have not earned, because that page
                      does not exist for you: the reader answers 404 rather
                      than rendering an achievement nobody made. */}
                  {isEarned && me?.handle ? (
                    <div className="mt-3 flex w-full justify-center">
                      <Button
                        variant="glass"
                        size="sm"
                        dense
                        render={
                          <Link href={`/u/${me.handle}/crest/${c.slug}`} />
                        }
                      >
                        <Icon name="share" className="h-3.5 w-3.5" />
                        Show it to somebody
                      </Button>
                    </div>
                  ) : null}
                  {isEarned && mint?.open ? (
                    <div className="mt-3 w-full border-t border-hair pt-3">
                      {claims.get(c.slug)?.status === "minted" ? (
                        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">
                          In your wallet
                        </p>
                      ) : (
                        <ClaimButton
                          subject={{ kind: "crest", crestSlug: c.slug }}
                          label="Claim to your wallet"
                          onClaimed={() => void loadClaims()}
                        />
                      )}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* WHAT A MEMBER KEEPS WHEN A SEASON CLOSES.
 *
 * The season close freezes every member's rank and figures into
 * season_settlements and then resets Glory to zero, on the reasoning that a
 * season in which nothing resets is a leaderboard with a name on it. That
 * makes this the answer to the obvious next question: if the score goes, what
 * did the season leave me?
 *
 * Renown, which never falls and is the ladder at the top of this very page.
 * POINTS, which are an earned balance and are never confiscated. The crest, if
 * they finished on the podium. And this row: where they stood when it closed,
 * frozen at that instant and never recomputed, so nothing anybody does
 * afterwards can move it.
 *
 * It belongs here rather than on the Houses board because it is a personal
 * record and that board is a public one, and because this page is already the
 * page that answers "what have I earned". season_settlements is denied to
 * every browser role, so it reaches the member through a route that resolves
 * them from a verified token and reads their rows and nobody else's.
 *
 * Absent until there is a settled season to show, and absent rather than
 * empty. A member in the realm's first season has no record yet, and a card
 * saying "no seasons" would be a permanent piece of furniture explaining the
 * absence of something they have not had the chance to earn.
 *
 * Board rules: ranked rows, right aligned figures on tnum, hairline dividers,
 * no zebra. It stays a list at every width rather than becoming a table,
 * because three facts per row do not need columns and a table would be a
 * desktop layout squeezed onto a phone. */

interface SeasonRecordRow {
  season_id: number;
  name: string | null;
  rank: number;
  points: number;
  renown: number;
  glory: number;
}

function SeasonRecord() {
  const [rows, setRows] = useState<SeasonRecordRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void realmFetch<{ seasons?: SeasonRecordRow[] }>("/api/seasons/record").then(
      (res) => {
        if (live && res.ok) setRows(res.data?.seasons ?? []);
      }
    );
    return () => {
      live = false;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <>
      <SectionHeader title="Seasons behind you" />
      <p className="-mt-1 px-1 text-xs text-bone-faint">
        Frozen when each season closed. Glory resets, this does not.
      </p>
      <Card pad="none" className="overflow-hidden">
        <ul>
          {rows.map((row, i) => (
            <li
              key={row.season_id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-hair" : ""
              }`}
            >
              <span className="tnum w-8 shrink-0 text-center font-display text-base text-gold">
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-bone">
                  {row.name ?? `Season ${row.season_id}`}
                </span>
                <span className="block truncate text-[11px] text-bone-faint">
                  {/* POINTS, never a $RSP figure. Rule 7. */}
                  {row.points.toLocaleString()} POINTS held at the close
                </span>
              </span>
              <span className="tnum shrink-0 text-right text-xs text-bone-mut">
                <span className="block font-semibold text-bone">
                  {row.glory.toLocaleString()}
                </span>
                <span className="block text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                  Glory
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
