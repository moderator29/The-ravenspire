"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/icon";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import {
  STREAM_BODY,
  STREAM_META,
  StreamCard,
  type StreamRail,
} from "@/components/stream/stream-shell";
import { timeAgo } from "@/lib/social/types";
import type { FeedEvent } from "@/lib/feed/types";

/* What a realm event looks like in the Ravenry.
 *
 * Two shells, both on the one card chassis. They differ by interior only,
 * never by radius, width or shape, which is the whole reason a feed of nine
 * card types can sit in one column and still read as one product.
 *
 * SystemCard is the Ledger register and covers almost everything: a flat glyph
 * in a steel tile instead of an avatar, secondary text rather than primary, a
 * smaller vertical footprint than a raven, and no glow at all. Section 5 of the
 * design system is explicit that a system card must be structurally lower
 * energy than a member's words, because a feed where the announcements shout is
 * an advertising board.
 *
 * ForgeCard is the exception the Ledger earns: a Crest unlocking and a House
 * overtaking a rival, and nothing else. Those two get the 3D icon, the bright
 * rail and gold on the noun that matters. They read as rare only because every
 * card around them is quiet, so this list does not grow.
 *
 * Two type sizes exist here, the same two the Stream declares: 15px body and
 * 12px meta. Nothing in a system card is larger than a member's own words. */

/* Payload readers.
 *
 * A payload is versioned, denormalised and written by whichever surface emitted
 * the event, so a card reads it defensively and never asserts a shape. A card
 * missing something it needs renders nothing at all: an honest gap in the
 * timeline is the only alternative to inventing the value, and inventing it is
 * forbidden. */
export function payloadText(
  payload: Record<string, unknown>,
  key: string
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function payloadNumber(
  payload: Record<string, unknown>,
  key: string
): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* The member who caused an event, as one linked name. Falls back to the plain
   handle when there is no display name, and to nothing at all when the actor
   has been removed, which a card must survive. */
export function ActorName({ event }: { event: FeedEvent }) {
  const actor = event.actor;
  if (!actor) return <span className="text-bone">A member</span>;
  const label = actor.display_name ?? (actor.handle ? `@${actor.handle}` : null);
  if (!label) return <span className="text-bone">A member</span>;
  if (!actor.handle) return <span className="font-medium text-bone">{label}</span>;
  return (
    <Link
      href={`/u/${actor.handle}`}
      className="font-medium text-bone hover:underline"
    >
      {label}
    </Link>
  );
}

function MetaRow({
  label,
  at,
  trailing,
}: {
  label: string;
  at: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cx("flex items-center gap-2", STREAM_META)}>
      <span className="truncate font-semibold uppercase tracking-[0.16em] text-bone-faint">
        {label}
      </span>
      <span aria-hidden className="text-bone-faint">
        ·
      </span>
      <time dateTime={at} className="shrink-0 text-bone-faint">
        {timeAgo(at)}
      </time>
      {trailing ? <span className="ml-auto shrink-0">{trailing}</span> : null}
    </div>
  );
}

export interface CardShellProps {
  event: FeedEvent;
  /* The kind, in one word, above the sentence. */
  label: string;
  /* A flat glyph from components/ui/icon. Never an emoji. */
  icon: string;
  rail?: StreamRail;
  railColor?: string;
  /* A Badge, usually. Sits opposite the label. */
  trailing?: ReactNode;
  /* One primary action, or nothing. A card that only announces is an
     advertisement (design system, section 5). */
  action?: ReactNode;
  children: ReactNode;
}

export function SystemCard({
  event,
  label,
  icon,
  rail = "steel",
  railColor,
  trailing,
  action,
  children,
}: CardShellProps) {
  return (
    <StreamCard
      rail={rail}
      {...(railColor ? { railColor } : {})}
      pad="sm"
      className="stream-enter"
    >
      <div className="flex gap-3 pl-1.5">
        {/* A tile, not an avatar. The difference in the leading column is the
            fastest way a reader tells the realm's voice from a member's. */}
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-steel-line bg-panel text-steel"
        >
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <MetaRow label={label} at={event.created_at} trailing={trailing} />
          <div className={cx("mt-1 leading-relaxed text-bone-mut", STREAM_BODY)}>
            {children}
          </div>
          {action ? <div className="mt-2.5 flex">{action}</div> : null}
        </div>
      </div>
    </StreamCard>
  );
}

export interface ForgeCardProps extends Omit<CardShellProps, "icon"> {
  /* The expressive set, never inline in a button and never below 40px. */
  icon: Icon3DName;
}

export function ForgeCard({
  event,
  label,
  icon,
  rail = "bright",
  railColor,
  trailing,
  action,
  children,
}: ForgeCardProps) {
  return (
    <StreamCard
      rail={rail}
      {...(railColor ? { railColor } : {})}
      pad="sm"
      variant="warm"
      className="stream-enter"
    >
      <div className="flex gap-3 pl-1.5">
        {/* 40px on a phone, 64px from sm, which is the reward row size in the
            icon table. The card does not otherwise change: same chassis, same
            column, same rhythm. */}
        <span aria-hidden className="shrink-0">
          <Icon3D name={icon} size="sm" className="sm:hidden" />
          <Icon3D name={icon} size="md" className="max-sm:hidden" />
        </span>
        <div className="min-w-0 flex-1">
          <MetaRow label={label} at={event.created_at} trailing={trailing} />
          <div className={cx("mt-1 leading-relaxed text-bone-mut", STREAM_BODY)}>
            {children}
          </div>
          {action ? <div className="mt-2.5 flex">{action}</div> : null}
        </div>
      </div>
    </StreamCard>
  );
}

/* The one action a card is allowed. 36px on a desktop where the pointer is
   precise, 44px on a phone where it is not, which is the responsive law rather
   than a resize of the same control. */
export const CARD_ACTION_CLASS = "max-md:h-11 max-md:px-4";

/* A dense fact inside a card: a small caps key and a value that lines up.
   Used by the verdict and the overtake cards, where the numbers are the
   point. */
export function CardFacts({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
      {children}
    </dl>
  );
}

export function CardFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "up" | "down" | "gold";
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt
        className={cx(
          "shrink-0 uppercase tracking-[0.16em] text-bone-faint",
          STREAM_META
        )}
      >
        {label}
      </dt>
      <dd
        className={cx(
          "tnum truncate font-medium",
          STREAM_META,
          tone === "up"
            ? "text-chart-up"
            : tone === "down"
              ? "text-chart-down"
              : tone === "gold"
                ? "text-gold"
                : "text-bone"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
