"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { OathEntryView } from "@/lib/houses/view";
import { roleMeta } from "@/lib/houses/roles";

/* The public oath history on a Keep.
 *
 * "House Emberfall (Season 1 to 3), House Corvane (Season 4 to present)".
 *
 * This is the part of the oath system that gives switching a cost worth
 * paying: the record is permanent and public, so a member who moved is seen to
 * have moved, and a member who stayed through a bad season is seen to have
 * stayed. It renders only when there is something to say. */

export function OathHistory({ profileId }: { profileId: string }) {
  const [oaths, setOaths] = useState<OathEntryView[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetch(`/api/houses/oath?profile=${encodeURIComponent(profileId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { oaths?: OathEntryView[] } | null) => {
        if (live) setOaths(payload?.oaths ?? []);
      })
      .catch(() => live && setOaths([]));
    return () => {
      live = false;
    };
  }, [profileId]);

  /* One oath is just "their House", which the banner above already says. The
     history earns its place only once there is a history. */
  if (!oaths || oaths.length < 2) return null;

  return (
    <div className="mt-3 rounded-md border border-steel-line bg-obsidian/50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-bone-faint">
        <Icon name="scroll" className="h-3 w-3" />
        Oaths sworn
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {oaths.map((oath) => {
          const role = roleMeta(oath.role);
          return (
            <li
              key={oath.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-sm"
                style={{ background: oath.color ?? "var(--gold)" }}
              />
              <Link
                href={`/houses/${oath.house_slug}`}
                className="font-semibold text-bone hover:text-gold"
              >
                {oath.house_name}
              </Link>
              <span className="text-bone-faint">{oath.span}</span>
              {oath.current && oath.role !== "sworn" ? (
                <span className="text-gold">{role.title}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
