/* The whole class-name utility layer, in nine lines.

   Deliberately not `clsx` and deliberately not `tailwind-variants`: the
   primitives here compose a fixed base string with one variant string and one
   size string, which is a join, not a merge.

   This is a join and nothing more. It does NOT resolve conflicts, and the
   previous version of this comment claimed it did not need to because "any
   caller override arrives last in the string and wins on source order". That
   is false, and it is worth spelling out why, because the false version of it
   is what let twenty one silently dead overrides accumulate across the
   product.

   The order of names inside a `class` attribute has no effect on anything. At
   equal specificity the winner is decided by cascade layer first and then by
   which rule appears later in the emitted stylesheet. Measured on this
   project's own build, Tailwind emits every utility of a family in sorted
   order: numerically ascending for spacing and opacity, alphabetically
   otherwise. So the real rule a caller would have to know is:

     a caller's utility takes effect only when it sorts after the primitive's
     base utility in the same family

   which for padding reads as "you may override upward but never downward"
   (`p-6` beats `p-4`, `p-3` does not) and for radius as "`rounded-xl` beats
   every other plain rung, because xl sorts last". Nobody would choose those
   rules and nobody can hold them in their head, which is the point.

   The fix is not to make this function smarter. Two of the four broken groups
   could not be repaired by ordering at all: `Card`'s lit variants paint a
   `bg-[image:...]` gradient over the background colour, so a caller's
   `bg-panel` loses regardless of which rule wins. So the primitives took
   explicit props for the things callers were fighting them over (`tone`,
   `elevation`, `pad`, `opaque`, and the `raised` variant), and
   `scripts/check-house-rules.mjs` now fails the build when a call site passes
   a class in a family its primitive owns. A conflict is a compile error now,
   not a silent no-op. */

export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  let out = "";
  for (const value of values) {
    if (!value) continue;
    out = out ? `${out} ${value}` : value;
  }
  return out;
}
