"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  actor: { handle: string | null; display_name: string | null } | null;
}

interface SeasonRow {
  id: number;
  name: string;
  status: string;
  ends_at: string | null;
}

interface FlagRow {
  key: string;
  enabled: boolean;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminSettingsPage() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      realmFetch<{ audit: AuditRow[] }>("/api/admin/overview"),
      realmFetch<{ seasons: SeasonRow[] }>("/api/admin/seasons"),
      realmFetch<{ flags: FlagRow[] }>("/api/admin/flags"),
    ]).then(([ov, se, fl]) => {
      if (cancelled) return;
      if (ov.status === 401 || ov.status === 403) {
        setStatus("sealed");
        return;
      }
      if (ov.ok && ov.data) setAudit(ov.data.audit ?? []);
      if (se.ok && se.data?.seasons) setSeasons(se.data.seasons);
      if (fl.ok && fl.data?.flags) setFlags(fl.data.flags);
      setStatus(ov.ok ? "ok" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "sealed") {
    return (
      <div className="glass p-8 text-center">
        <Icon name="lock" className="mx-auto h-6 w-6 text-bone-faint" />
        <p className="gold-text font-display mt-3 text-xl font-semibold">
          The council chamber is sealed
        </p>
      </div>
    );
  }

  const activeSeason = seasons.find((s) => s.status === "active") ?? null;
  const enabledFlags = flags.filter((f) => f.enabled).length;

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Settings
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Platform configuration and the audit trail
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="glass glass-sm p-4 sm:p-5">
          <Icon name="crown" className="h-4 w-4 text-bone-faint" />
          <p className="mt-2 font-display text-base font-semibold text-bone">
            {activeSeason ? activeSeason.name : "No active season"}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
            {activeSeason
              ? `Closes ${activeSeason.ends_at ? new Date(activeSeason.ends_at).toLocaleDateString() : "unset"}`
              : "Open one in Seasons"}
          </p>
          <Link
            href="/admin/seasons"
            className="mt-3 inline-block text-xs text-gold hover:underline"
          >
            Manage seasons
          </Link>
        </div>
        <div className="glass glass-sm p-4 sm:p-5">
          <Icon name="sliders" className="h-4 w-4 text-bone-faint" />
          <p className="tnum mt-2 font-display text-2xl font-semibold text-gold">
            {enabledFlags}/{flags.length}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
            Feature flags enabled
          </p>
          <Link
            href="/admin/flags"
            className="mt-3 inline-block text-xs text-gold hover:underline"
          >
            Manage flags
          </Link>
        </div>
        <div className="glass glass-sm p-4 sm:p-5">
          <Icon name="shield" className="h-4 w-4 text-bone-faint" />
          <p className="mt-2 font-display text-base font-semibold text-bone">
            Moderation
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
            Reports and takedowns
          </p>
          <Link
            href="/admin/reports"
            className="mt-3 inline-block text-xs text-gold hover:underline"
          >
            View report history
          </Link>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-bone">
          Audit trail
        </h2>
        <p className="mt-1 text-xs text-bone-faint">
          Every privileged action is recorded with who acted and when.
        </p>
        <div className="glass mt-3 overflow-x-auto">
          {status === "loading" ? (
            <div className="h-40 animate-pulse" />
          ) : audit.length === 0 ? (
            <div className="flex items-center gap-3 p-6">
              <Icon name="scroll" className="h-5 w-5 text-bone-faint" />
              <p className="text-sm text-bone-mut">
                No council actions recorded yet.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-steel-line text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                  <th className="px-4 py-3 font-medium">Steward</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-steel-line last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-bone">
                      {a.actor?.display_name?.trim() ||
                        (a.actor?.handle ? `@${a.actor.handle}` : "System")}
                    </td>
                    <td className="px-4 py-3 capitalize text-bone-mut">
                      {a.action.replace(/_/g, " ")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-bone-faint">
                      {a.target_type ?? "-"}
                    </td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-xs text-bone-faint">
                      {timeAgo(a.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
