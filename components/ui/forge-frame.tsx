import { cx } from "@/components/ui/cx";

/* THE FORGE FRAME (design law, rule 21: ornament is earned).
 *
 * The forged-gold accents that turn a plain container into a collectible plate:
 * four corner brackets and a small HUD tick motif, drawn from the reference
 * card. Shared by every collectible surface, the Reliquary, the Warchests and
 * the Mercer, so a framed card looks the same wherever it appears. Borders and
 * skewed bars only, no radius, so they read sharp. The corners brighten with a
 * `.group` on hover; outside a group the hover class is simply inert. */

export function ForgeCorners({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim =
    size === "lg" ? "h-4 w-4" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const base = cx(
    "pointer-events-none absolute border-gold/45 transition-colors duration-fast group-hover:border-gold-bright/90",
    dim
  );
  return (
    <>
      <span aria-hidden className={cx(base, "left-1.5 top-1.5 border-l-2 border-t-2")} />
      <span aria-hidden className={cx(base, "right-1.5 top-1.5 border-r-2 border-t-2")} />
      <span aria-hidden className={cx(base, "bottom-1.5 left-1.5 border-b-2 border-l-2")} />
      <span aria-hidden className={cx(base, "bottom-1.5 right-1.5 border-b-2 border-r-2")} />
    </>
  );
}

export function ForgeTicks() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-2 flex items-center gap-[3px]"
    >
      <span className="h-2.5 w-[2px] -skew-x-12 bg-gold/60" />
      <span className="h-2.5 w-[2px] -skew-x-12 bg-gold/45" />
      <span className="h-2.5 w-[2px] -skew-x-12 bg-gold/30" />
    </span>
  );
}

/* The gold hairline that tops an info plate, the reference card's divider. */
export function ForgeHairline() {
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,var(--gold),transparent)] opacity-70"
    />
  );
}
