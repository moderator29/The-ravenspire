import type { ReactNode } from "react";
import { Icon3D, type Icon3DName } from "@/components/ui/icon-3d";
import { cx } from "@/components/ui/cx";

/* Shared furniture for the five Chronicles chapters, so a reading column
   built by five separate passes still reads as one book. Document archetype
   throughout: comfortable density, --text-secondary body, at most one 3D
   icon per section heading. */

export function ChapterHeader({
  kicker,
  icon,
  title,
  dek,
}: {
  kicker: string;
  icon: Icon3DName;
  title: string;
  dek: string;
}) {
  return (
    <header className="max-w-[42rem]">
      <Icon3D name={icon} size="lg" priority />
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">
        {kicker}
      </p>
      <h1 className="gold-text mt-2 font-display text-3xl font-semibold tracking-[0.01em] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-bone-mut">{dek}</p>
    </header>
  );
}

export function Section({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon?: Icon3DName;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-steel-line pt-9">
      <div className="flex items-center gap-3">
        {icon ? <Icon3D name={icon} size="sm" /> : null}
        <h2 className="font-display text-xl font-semibold text-bone sm:text-2xl">
          {title}
        </h2>
      </div>
      <div className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed text-bone-mut">
        {children}
      </div>
    </section>
  );
}

/* The one honest label every claim in the Chronicles carries: live and
   reachable, genuinely being built with the gap stated, or designed and not
   started. The exact three-way status docs/PLATFORM.md itself uses, so the
   Chronicles and the platform's own reference document can never quietly
   disagree about what is real. */
export type ChapterStatus = "live" | "building" | "vision";

const STATUS_LABEL: Record<ChapterStatus, string> = {
  live: "Live today",
  building: "In development",
  vision: "Planned",
};

/* "building" carries no ember text: --ember measures 4.3:1 on a dark panel,
   under the 4.5:1 rule 11 requires, and ember has no AA-safe "-text" twin
   the way --foe and --blood do (app/globals.css). The border and wash still
   carry the color; the label itself stays on a token already proven safe. */
const STATUS_CLASS: Record<ChapterStatus, string> = {
  live: "border-gold/35 bg-gold/8 text-gold",
  building: "border-ember/35 bg-ember/8 text-bone-mut",
  vision: "border-steel-line text-bone-faint",
};

export function StatusBadge({ status }: { status: ChapterStatus }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
        STATUS_CLASS[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <p className="my-2 border-l-2 border-gold/40 pl-5 font-display text-lg italic leading-snug text-bone sm:text-xl">
      {children}
    </p>
  );
}

export function FactRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-steel-line/60 py-2.5 text-sm last:border-b-0">
      <span className="text-bone-mut">{label}</span>
      <span className="text-right">
        <span className="tnum font-display font-semibold text-bone">
          {value}
        </span>
        {note ? (
          <span className="ml-2 text-[12px] text-bone-faint">{note}</span>
        ) : null}
      </span>
    </div>
  );
}

export function ChapterFooter({
  prev,
  next,
}: {
  prev?: { href: string; title: string };
  next?: { href: string; title: string };
}) {
  return (
    <nav
      aria-label="Chronicles pagination"
      className="mt-14 flex items-stretch gap-3 border-t border-steel-line pt-8"
    >
      {prev ? (
        <a
          href={prev.href}
          className="group flex flex-1 flex-col gap-1 rounded-md border border-steel-line px-4 py-3 transition hover:border-gold/30"
        >
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            Previous
          </span>
          <span className="font-display text-sm font-semibold text-bone group-hover:text-gold">
            {prev.title}
          </span>
        </a>
      ) : (
        <span className="flex-1" />
      )}
      {next ? (
        <a
          href={next.href}
          className="group flex flex-1 flex-col items-end gap-1 rounded-md border border-steel-line px-4 py-3 text-right transition hover:border-gold/30"
        >
          <span className="text-[11px] uppercase tracking-[0.2em] text-bone-faint">
            Next
          </span>
          <span className="font-display text-sm font-semibold text-bone group-hover:text-gold">
            {next.title}
          </span>
        </a>
      ) : (
        <span className="flex-1" />
      )}
    </nav>
  );
}
