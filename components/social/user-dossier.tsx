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
import { createPortal } from "react-dom";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import { Icon } from "@/components/ui/icon";
import { createClient } from "@/lib/supabase/client";
import { TIER_NAMES } from "@/lib/social/types";

/* THE DOSSIER
   A quick, non-navigating read on a member — opened by tapping their avatar in
   the feed — so a reader can size someone up and follow them without leaving
   the timeline. Renders as a portal slide-over (right on desktop, bottom sheet
   on mobile) so it never reflows the page, mirroring the OverflowMenu pattern:
   backdrop + fixed panel, closes on outside click or Escape. All figures are
   real, read public-only from the profiles + posts tables. */

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
}

const fmt = new Intl.NumberFormat("en-US");

/* Read the member's public standing and settle-record. Public fields only —
   never privy_id, wallet_address, settings or is_admin. */
async function fetchDossier(profileId: string): Promise<DossierData | null> {
  const db = createClient();
  const [{ data: prof }, { data: calls }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "handle, display_name, avatar_url, tier, renown, glory, house_slug, is_verified"
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const open = useCallback((profileId: string, handle: string | null) => {
    setTarget({ profileId, handle });
  }, []);
  const close = useCallback(() => setTarget(null), []);

  /* Load the dossier whenever a new target is opened. */
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

  /* Close on Escape while open. */
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  const handle = data?.handle ?? target?.handle ?? null;
  const tierLabel = data?.tier ? (TIER_NAMES[data.tier] ?? data.tier) : null;

  return (
    <DossierContext.Provider value={{ open }}>
      {children}
      {mounted &&
        target &&
        createPortal(
          <>
            <button
              aria-label="Close"
              onClick={close}
              className="fixed inset-0 z-[95] cursor-default bg-black/60 backdrop-blur-sm"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Member dossier"
              className="fixed inset-x-0 bottom-0 z-[96] max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-steel-line bg-obsidian p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[360px] sm:rounded-none sm:border-l sm:border-t-0 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
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
                <button
                  aria-label="Close dossier"
                  onClick={close}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bone-faint transition hover:bg-panel hover:text-bone-mut"
                >
                  <Icon name="plus" className="h-4 w-4 rotate-45" />
                </button>
              </div>

              {/* Standing */}
              <div className="tnum mt-5 grid grid-cols-2 gap-2">
                <Stat label="Renown" value={loading ? "…" : fmt.format(data?.renown ?? 0)} icon="medal" />
                <Stat label="Glory" value={loading ? "…" : fmt.format(data?.glory ?? 0)} icon="crown" />
                <Stat label="Calls won" value={loading ? "…" : fmt.format(data?.callsWon ?? 0)} icon="target" />
                <Stat label="Calls lost" value={loading ? "…" : fmt.format(data?.callsLost ?? 0)} icon="flag" />
              </div>

              {data && data.callsOpen > 0 && (
                <p className="mt-2 text-center text-[11px] text-bone-faint">
                  {fmt.format(data.callsOpen)} live{" "}
                  {data.callsOpen === 1 ? "call" : "calls"} still open
                </p>
              )}

              {/* Actions */}
              <div className="mt-5 flex items-center gap-2">
                <div className="flex-1">
                  <FollowButton targetId={target.profileId} size="md" />
                </div>
                {handle && (
                  <Link
                    href={`/u/${handle}`}
                    onClick={close}
                    className="btn-glass flex-1 px-4 py-1.5 text-center text-xs text-bone-mut"
                  >
                    View Keep
                  </Link>
                )}
              </div>

              {!loading && !data && (
                <p className="mt-4 text-center text-sm text-bone-faint">
                  This Keep could not be read right now.
                </p>
              )}
            </div>
          </>,
          document.body
        )}
    </DossierContext.Provider>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-steel-line/70 bg-void/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-bone-faint">
        <Icon name={icon} className="h-3.5 w-3.5 text-gold" />
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-bone">{value}</p>
    </div>
  );
}
