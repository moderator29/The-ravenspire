/* The whole class-name utility layer, in nine lines.

   Deliberately not `clsx` and deliberately not `tailwind-variants`: the
   primitives here compose a fixed base string with one variant string and one
   size string, which is a join, not a merge. Nothing in this layer needs
   conflict resolution, because a primitive owns its own base classes and any
   caller override arrives last in the string and wins on source order. */

export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  let out = "";
  for (const value of values) {
    if (!value) continue;
    out = out ? `${out} ${value}` : value;
  }
  return out;
}
