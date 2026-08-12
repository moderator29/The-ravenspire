import type { ClassValue } from "@/components/ui/cx";

/* Class merging, scoped to the primitive layer.

   `cx` is a join and stays a join. This is the other half, and the primitives
   are the only callers: when a primitive composes its own base classes with a
   caller's `className`, the caller has to win, and a join cannot deliver that.

   Why a join cannot deliver it, measured rather than assumed: the order of
   names inside a `class` attribute has no effect on anything. At equal
   specificity the winner is the rule emitted later in the stylesheet, and
   Tailwind v4 emits each family in sorted order, numerically ascending for
   spacing and alphabetically otherwise. So `rounded-md` beats
   `rounded-[var(--radius-full)]`, `font-semibold` beats `font-normal`,
   `relative` beats `fixed` and `inline-flex` beats `hidden`, all of which were
   live defects in this product: every circular icon button rendered as a
   rounded rectangle, the back to top control was not fixed to the viewport,
   the landing page's mobile nav dropped in flow instead of overlaying, and the
   carousel arrows that were meant to be desktop only were visible on a phone.

   The fix is to drop the base class rather than to out-rank it. A base class
   is emitted only when the caller has said nothing about that CSS property.
   Nothing here depends on emission order, so nothing here can be broken by a
   future Tailwind changing it.

   Deliberately not `tailwind-merge`: this needs to know about the realm's own
   tokens (`bg-panel-warm/70`, `shadow-forge`, `border-steel-line`) and it needs
   to be readable by the people who own these fifteen primitives. The table
   below covers what the primitives actually set, and anything it does not
   recognise is appended rather than dropped, so an unknown class can never go
   missing. The failure mode is a conflict this does not catch, which is where
   the product already was, never a class silently disappearing. */

/* One entry per CSS property a primitive sets. Order matters: the first match
   wins, so the narrow patterns sit above the broad ones. */
const FAMILIES: [RegExp, string][] = [
  [/^(relative|absolute|fixed|sticky|static)$/, "position"],
  [
    /^(flex|inline-flex|block|inline-block|inline|grid|inline-grid|hidden|contents)$/,
    "display",
  ],
  [/^(flex-row|flex-col|flex-row-reverse|flex-col-reverse)$/, "flex-direction"],
  [/^(flex-wrap|flex-nowrap|flex-wrap-reverse)$/, "flex-wrap"],
  [/^justify-/, "justify-content"],
  [/^items-/, "align-items"],
  [/^self-/, "align-self"],
  [/^gap-/, "gap"],
  [
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
    "font-weight",
  ],
  [/^font-(display|sans|serif|mono)$/, "font-family"],
  [/^leading-/, "line-height"],
  [/^tracking-/, "letter-spacing"],
  [/^whitespace-/, "white-space"],
  [/^text-(left|center|right|justify)$/, "text-align"],
  /* Font size before colour: `text-sm` is a size, `text-bone` is a colour, and
     both start `text-`. An arbitrary `text-[15px]` is a size; `text-[#fff]` is
     not, so the arbitrary branch only claims values that start with a digit. */
  [/^text-(xs|sm|base|lg|xl|[2-9]xl)$/, "font-size"],
  [/^text-\[[\d.]/, "font-size"],
  [/^text-/, "color"],
  [/^rounded(-(t|r|b|l|tl|tr|br|bl))-/, "border-radius-corner"],
  [/^rounded(-|$)/, "border-radius"],
  [/^p-/, "padding"],
  [/^px-/, "padding-x"],
  [/^py-/, "padding-y"],
  [/^pt-/, "padding-top"],
  [/^pr-/, "padding-right"],
  [/^pb-/, "padding-bottom"],
  [/^pl-/, "padding-left"],
  [/^(min-h-)/, "min-height"],
  [/^(max-h-)/, "max-height"],
  [/^(min-w-)/, "min-width"],
  [/^(max-w-)/, "max-width"],
  [/^h-/, "height"],
  [/^w-/, "width"],
  [/^bg-\[image:/, "background-image"],
  [/^bg-(none|gradient-)/, "background-image"],
  [/^bg-(clip|origin|repeat|blend|fixed|local|scroll)/, ""],
  [/^bg-/, "background-color"],
  [/^border-(solid|dashed|dotted|double|none)$/, "border-style"],
  [/^border-[trblxy]-\d/, ""],
  [/^border(-\d+)?$/, "border-width"],
  [/^border-/, "border-color"],
  [/^shadow-/, "box-shadow"],
  [/^backdrop-blur/, "backdrop-blur"],
  [/^opacity-/, "opacity"],
  [/^overflow-/, "overflow"],
  [/^z-/, "z-index"],
];

/* A shorthand covers its own longhands, and forgetting that is not academic.
 *
 * `p-` and `px-` key separately above, which is correct in one direction and
 * silently wrong in the other. A caller writing `p-0` on a `Button` whose size
 * sets `px-5` produced two surviving classes, not one: nothing displaced
 * anything, `px-5` is emitted later, and it won. Measured on the landing
 * page's mobile menu button: a 44x44 control with 40px of horizontal padding
 * left a 2px content box, so the hamburger icon asked for 20px and rendered at
 * 2. The only navigation control a phone had was an empty box with a dot in
 * it, and every class in the attribute looked right.
 *
 * Direction matters, which is why this is a one way map rather than a group.
 * A later `p-4` must drop an earlier `px-5`, because `p-` sets all four sides.
 * A later `px-5` must NOT drop an earlier `p-4`, because `p-4` still owns the
 * vertical axis; both survive and Tailwind resolves the horizontal one, which
 * is the correct outcome rather than a lucky one.
 *
 * Only padding is listed. Margin is deliberately absent from the table above,
 * so it is never arbitrated at all and cannot be half arbitrated here. The
 * corner radii have the same shape (`rounded-` over `rounded-t-`) and are
 * deliberately left alone for now: no call site has hit it, and changing how
 * radius resolves would touch every card and button in the product, which is
 * not a change to make on a hypothetical. */
const SUBSUMES: Record<string, string[]> = {
  padding: [
    "padding-x",
    "padding-y",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
  ],
  "padding-x": ["padding-left", "padding-right"],
  "padding-y": ["padding-top", "padding-bottom"],
};

const cache = new Map<string, Parsed | null>();

/* The variant prefix and the CSS property, kept apart so a shorthand can name
   its longhands under the same prefix: `sm:p-0` covers `sm:px-5` and must not
   touch a bare `px-5`. */
interface Parsed {
  prefix: string;
  family: string;
}

/* The property this class sets, or null when we do not recognise it.
   Responsive and state variants key separately: `sm:p-5` and `p-4` do not
   fight, and neither do `hover:bg-x` and `bg-y`. */
function keyOf(cls: string): Parsed | null {
  const cached = cache.get(cls);
  if (cached !== undefined) return cached;

  /* The variant separator is the last colon OUTSIDE any bracket. Naively
     taking the last colon splits `bg-[image:linear-gradient(...)]` in the
     middle of its own value, which made every arbitrary background image
     unrecognisable and therefore undroppable. Square brackets and parentheses
     both nest here: `[@media(pointer:coarse)]:min-h-11` contains two colons
     that are not the separator. */
  let depth = 0;
  let split = -1;
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) split = i;
  }
  const prefix = split === -1 ? "" : cls.slice(0, split + 1);
  const bare = split === -1 ? cls : cls.slice(split + 1);
  /* An important marker changes precedence, not the property. */
  const name = bare.startsWith("!") ? bare.slice(1) : bare;

  let key: Parsed | null = null;
  for (const [re, family] of FAMILIES) {
    if (!re.test(name)) continue;
    /* An empty family means "recognised, but sets nothing we arbitrate". */
    key = family ? { prefix, family } : null;
    break;
  }
  cache.set(cls, key);
  return key;
}

/* Join, but a later value displaces an earlier one that sets the same CSS
   property. Use this wherever a primitive composes its own classes with a
   caller's; use `cx` everywhere else. */
export function mergeClasses(...values: ClassValue[]): string {
  const classes: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const cls of value.split(" ")) if (cls) classes.push(cls);
  }

  /* Walk backwards so the last mention of a property is the one kept, then
     reverse at the end to restore the written order. Order does not change
     what renders, but a stable, readable class attribute is worth having when
     someone opens dev tools to work out what happened. */
  const seen = new Set<string>();
  const kept: string[] = [];
  for (let i = classes.length - 1; i >= 0; i--) {
    const cls = classes[i];
    const key = keyOf(cls);
    if (key !== null) {
      const own = key.prefix + key.family;
      if (seen.has(own)) continue;
      seen.add(own);
      /* Claim the longhands too, so an earlier `px-5` cannot outlive a later
         `p-0`. Under the same variant prefix only. */
      for (const sub of SUBSUMES[key.family] ?? []) seen.add(key.prefix + sub);
    }
    kept.push(cls);
  }
  return kept.reverse().join(" ");
}
