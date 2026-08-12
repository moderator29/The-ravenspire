"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Sheet, useIsMobile } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { TIER_NAMES } from "@/lib/social/types";

/* THE DOSSIER
   A quick, non-navigating read on a member, opened by tapping their avatar in
   the feed, so a reader can size someone up and follow them without leaving
   the timeline.

   It is the Dossier archetype in miniature: a hero band carrying the identity,
   then one panel of standing, then the actions. No tabs, because there is only
   one section. All figures are real, read public-only from the profiles and
   posts tables.

   It presents on the Sheet primitive, which portals to document.body, traps and
   restores focus, closes on Escape and on an outside press, and offers drag to
   dismiss on a phone. The hand rolled portal it replaces did the first and the
   last of those and none of the rest. */

interface DossierTarget {
  profileId: string;
  handle: string | null;
}

interface DossierData {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  tier: string | null;
  renown: number;
  glory: number;
  houseSlug: string | null;
  isVerified: boolean;
  joined: string | null;
  callsWon: number;
  callsLost: number;
  callsOpen: number;
}

interface ProfileRow {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  tier: string | null;
  renown: number | null;
  glory: number | null;
  house_slug: string | null;
  is_verified: boolean | null;
  created_at: string | null;
}

const fmt = new Intl.NumberFormat("en-US");

function joinLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* Read the member's public standing and settle-record. Public fields only,
   never privy_id, wallet_address, settings or is_admin. */
async function fetchDossier(profileId: string): Promise<DossierData | null> {
  const db = createClient();
  const [{ data: prof }, { data: calls }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "handle, display_name, avatar_url, tier, renown, glory, house_slug, is_verified, created_at"
      )
      .eq("id", profileId)
      .maybeSingle(),
    db
      .from("posts")
      .select("call")
      .eq("author_id", profileId)
      .eq("kind", "call")
      .eq("deleted", false)
      .limit(300),
  ]);

  if (!prof) return null;
  const p = prof as ProfileRow;

  let callsWon = 0;
  let callsLost = 0;
  let callsOpen = 0;
  for (const row of (calls ?? []) as { call: { verdict?: string } | null }[]) {
    const v = row.call?.verdict;
    if (v === "hit") callsWon++;
    else if (v === "miss") callsLost++;
    else callsOpen++;
  }

  return {
    handle: p.handle,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    tier: p.tier,
    renown: p.renown ?? 0,
    glory: p.glory ?? 0,
    houseSlug: p.house_slug,
    isVerified: Boolean(p.is_verified),
    joined: p.created_at,
    callsWon,
    callsLost,
    callsOpen,
  };
}

interface DossierContextValue {
  open: (profileId: string, handle: string | null) => void;
}

const DossierContext = createContext<DossierContextValue | null>(null);

/* Opens the dossier for a member. No-op (returns a null-safe handle) when used
   outside the provider, so a stray caller never throws. */
export function useDossier(): DossierContextValue {
  return useContext(DossierContext) ?? { open: () => {} };
}

export function DossierProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DossierTarget | null>(null);
  const [data, setData] = useState<DossierData | null>(null);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  const open = useCallback((profileId: string, handle: string | null) => {
    setTarget({ profileId, handle });
  }, []);
  const close = useCallback(() => setTarget(null), []);

  /* Load the dossier whenever a new target is opened. Nothing is read until
     a member actually asks for a dossier, exactly as before. */
  useEffect(() => {
    if (!target) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setData(null);
    void fetchDossier(target.profileId).then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [target]);

  const handle = data?.handle ?? target?.handle ?? null;
  const tierLabel = data?.tier ? (TIER_NAMES[data.tier] ?? data.tier) : null;
  const settled = data ? data.callsWon + data.callsLost : 0;

  return (
    <DossierContext.Provider value={{ open }}>
      {children}
      <Sheet
        open={target !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        side={isMobile ? "bottom" : "right"}
        title="Member dossier"
      >
        {target ? (
          <div className="flex flex-col gap-5">
            {/* Hero band */}
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                author={{
                  handle: data?.handle ?? handle,
                  display_name: data?.displayName ?? null,
                  avatar_url: data?.avatarUrl ?? null,
                  house_slug: data?.houseSlug ?? null,
                }}
                size={52}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-display text-base font-semibold text-bone">
                    {data?.displayName ?? (handle ? `@${handle}` : "A member")}
                  </p>
                  {data?.isVerified && (
                    <Icon name="shield" className="h-4 w-4 shrink-0 text-gold" />
                  )}
                </div>
                {handle && (
                  <p className="truncate text-sm text-bone-faint">@{handle}</p>
                )}
                {tierLabel && (
                  <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-gold/80">
                    {tierLabel}
                  </p>
                )}
              </div>
            </div>

            {/* Standing panel */}
            <div className="tnum grid grid-cols-2 gap-2">
              <Stat label="Renown" value={data?.renown ?? null} icon="medal" loading={loading} />
              <Stat label="Glory" value={data?.glory ?? null} icon="crown" loading={loading} />
              <Stat label="Calls won" value={data?.callsWon ?? null} icon="target" loading={loading} />
              <Stat label="Calls lost" value={data?.callsLost ?? null} icon="flag" loading={loading} />
            </div>

            {data && settled >= 3 && (
              <p className="flex justify-center">
                <Badge variant="gold" icon="target">
                  {Math.round((data.callsWon / settled) * 100)}% hit rate
                  <span className="font-normal normal-case tracking-normal text-bone-faint">
                    · {data.callsWon}/{settled}
                  </span>
                </Badge>
              </p>
            )}

            {data && (data.callsOpen > 0 || joinLabel(data.joined)) && (
              <p className="flex flex-wrap items-center justify-center gap-x-2 text-center text-[11px] text-bone-faint">
                {data.callsOpen > 0 && (
                  <span>
                    {fmt.format(data.callsOpen)} live{" "}
                    {data.callsOpen === 1 ? "call" : "calls"} still open
                  </span>
                )}
                {data.callsOpen > 0 && joinLabel(data.joined) && (
                  <span aria-hidden>·</span>
                )}
                {joinLabel(data.joined) && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="scroll" className="h-3 w-3 text-gold" />
                    Joined {joinLabel(data.joined)}
                  </span>
                )}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <FollowButton targetId={target.profileId} size="md" />
              </div>
              {handle && (
                <Button
                  variant="glass"
                  size="lg"
                  block
                  render={<Link href={`/u/${handle}`} onClick={close} />}
                  className="flex-1 text-bone-mut"
                >
                  View Keep
                </Button>
              )}
            </div>

            {!loading && !data && (
              <EmptyState
                size="sm"
                icon="alert"
                title="This Keep could not be read"
                body="The realm could not reach it just now. Close this and try again."
                action={
                  <Button variant="glass" size="lg" onClick={close}>
                    Close
                  </Button>
                }
              />
            )}
          </div>
        ) : null}
      </Sheet>
    </DossierContext.Provider>
  );
}

function Stat({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: number | null;
  icon: string;
  loading: boolean;
}) {
  return (
    <Card variant="inset" pad="none" className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-bone-faint">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      {loading || value === null ? (
        <Skeleton radius="sm" className="mt-2 h-5 w-14" />
      ) : (
        <p className="mt-1 text-lg font-semibold text-bone">
          {fmt.format(value)}
        </p>
      )}
    </Card>
  );
}
