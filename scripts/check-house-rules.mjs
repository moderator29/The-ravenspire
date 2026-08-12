/* House rule checker.
 *
 * AGENTS.md states twenty two rules. A rule enforced by whoever remembers it is
 * a rule that regresses, and this session alone turned up a dead `touch:`
 * variant that killed a product wide 44px floor, `hidden` classes that did not
 * hide, and a link doing a control's job at 49x16. None of those were
 * carelessness. They were rules with nothing checking them.
 *
 * Every rule here is structural: it reads shape, never a list of allowed paths.
 * That distinction was learned the hard way. The em dash rule began as a list
 * of allowed routes, had to be extended by hand whenever an AI surface shipped,
 * was extended late twice, and allowed a whole file rather than the one line
 * that needed it. Recognising the strip filter by its shape fixed all three at
 * once.
 *
 * Rules that cannot be checked structurally (real data, real AI, non custodial,
 * server authoritative rewards) stay prose in AGENTS.md and are deliberately
 * absent here. A check that cannot fail teaches people the whole file is
 * decorative.
 *
 * STRUCTURE
 * Every rule is an object with a `check(file, text)` that returns findings.
 * That is what makes them testable: scripts/check-house-rules.test.mjs feeds
 * each one a planted violation and asserts it fails, so no check in here is one
 * nobody has watched work. Importing this module runs nothing; the scan happens
 * only when it is invoked as a script.
 *
 * Usage: npm run check:rules
 */

import { readFileSync, realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const DASH = /[—–]/;

/* The one legitimate use of an em dash in the codebase: the character class in
 * an AI output filter, which strips them from model output. Deleting one would
 * let the model reintroduce the very thing this rule forbids.
 *
 * Recognised by shape rather than by path. A list of allowed routes was the
 * first approach and it was wrong: it had to be extended by hand every time an
 * AI surface shipped, it was extended late twice, and the second time three
 * routes reached the branch with CI red because the author had no reason to
 * know the list existed. Worse, an allowed path was allowed for the whole
 * file, so real prose in it went unchecked.
 *
 * This matches only the strip itself: a replace call whose pattern is a
 * character class of nothing but dashes. Prose cannot accidentally look like
 * that, and a new AI route needs no list entry and no knowledge of this file.
 *
 * The literal form is not written out here on purpose. A regex ending in a
 * global flag closes a block comment, which is how the first draft of this
 * comment turned the whole checker into a syntax error. */
const DASH_STRIPPER = /\.replace\(\s*\/[^/\n]*\[[—–]+\][^/\n]*\/[gimsuy]*\s*,/;

/* Circles are correct for avatars, status dots, count bubbles and the small
 * chain badges that sit on the corner of a token logo. A chip is the thing with
 * horizontal padding and a label inside it. */
const PILL_ALLOWED = [
  /min-w-\[?\d/, // count bubbles size themselves by content
  /-bottom-\d.*-right-\d/, // corner overlays on a logo
  /shape="circle"/, // the explicit IconButton opt in
  /rounded-full bg-(gold|ember|steel|bone)[^ ]*"\s*\/>/, // bare status dots
];

function files(patterns) {
  const out = execSync(
    `git ls-files ${patterns.map((p) => `'${p}'`).join(" ")}`,
    { encoding: "utf8" }
  );
  return out.split("\n").filter(Boolean);
}

/* Rule 9: buttons, tabs, chips and toggles are clean rounded rectangles.
   A full radius carrying horizontal padding is a chip, not a circle.

   Three spellings mean the same thing and the rule has to know all of them.
   `rounded-full` is Tailwind's own; `rounded-[var(--radius-full)]` and
   `rounded-[--radius-full]` reach for the realm's token. The first version of
   this rule understood only the Tailwind spelling, which left the token form
   completely unchecked across roughly twenty call sites. Nothing was hiding
   there when this was extended, so it is a guard rather than a sweep, but it
   is the spelling the primitives themselves use and therefore the one a new
   capsule is most likely to be written in.

   Horizontal padding is not only `px-`. The floating compose bar shipped two
   pill shaped links written as `py-2 pl-3.5 pr-2`, and this check walked past
   both of them because it only understood the shorthand. Any of px, pl or pr
   means the control has width beyond its content, which is what makes a
   rounded-full a capsule rather than a circle. */
const FULL_RADIUS =
  /\brounded-(?:full|\[var\(--radius-full\)\]|\[--radius-full\])/;

const HORIZONTAL_PAD = /\b(?:px|pl|pr)-[\d.]+/;

/* The second way a capsule hides. A tab rail written as `flex gap-0.5
   rounded-full p-0.5` has horizontal padding only through the all-sides `p-`
   shorthand, so the check above walks past it. Matching bare `p-` would be
   wrong, since `rounded-full p-2` around a single glyph is a legitimate
   circular icon button.

   `gap-` is the signal that separates them: gap only means something between
   siblings, and a circular icon button holds exactly one glyph. So a
   rounded-full that also sets a gap is a row of things, which is a capsule.
   Checked across the codebase when added: one match, zero false positives. */
const CAPSULE_ROW = /\bgap-[\d.]+/;

/* Rule 3b: one gold, not two.

   The gold scale was retuned to match the 3D icon set: a sharper, thicker
   gold. But forty two hardcoded values across seventeen files still carried
   the previous, duller gold, so the product shipped two golds side by side.
   The Privy theme, the app icon, every OpenGraph share image, avatars, House
   colours and the battle engine were all on the old one while everything
   token driven had moved.

   Most surfaces should use `var(--gold)` and its siblings rather than any hex
   at all. A literal is legitimate in exactly one place: OpenGraph and icon
   generation runs through Satori, which does not resolve CSS custom
   properties. Those files must therefore carry the current hex, which is why
   this checks for the RETIRED values rather than banning hexes outright. */
const RETIRED_GOLD = /#(c8a24c|f0d68c|8a6a2c|d8b45a)\b/i;

/* Rule 5: a background is a variant, never a class.
 *
 * Most base-versus-caller conflicts are now resolved in the primitives
 * themselves: `components/ui/merge.ts` drops a base class when the caller has
 * spoken about the same CSS property, so a caller's `p-3`, `rounded-lg`,
 * `fixed` or `font-normal` all take effect. That fixed twenty nine silently
 * dead classes and it needs no rule here.
 *
 * Background is the one group merging cannot fix, and the reason is worth
 * stating because it is not obvious. Card's lit variants and Button's glass
 * variant do not set a background colour, they set three things: a colour, a
 * backdrop blur, and a `bg-[image:...]` gradient painted over the colour. A
 * caller writing `bg-panel` replaces only the first of the three, so the
 * gradient still covers it and the card still does not look like `bg-panel`.
 * No ordering rule and no merge can rescue that, because the caller has not
 * said anything about the other two layers.
 *
 * So a background is chosen by `variant` (or `opaque` on a Button), and this
 * check keeps it that way. `ghost` sets no background at all, and `raised` and
 * `inset` set a flat colour with no gradient, so a caller's own background on
 * those is the only one in play and is allowed. */
const BACKGROUND = /^bg-(?!\[)(?!clip-|origin-|repeat|blend-|fixed$|local$|scroll$)[a-z]/;

const BACKGROUND_GUARD = [
  {
    component: "Card",
    /* The flat variants have no gradient over the colour, so nothing is
       fighting the caller there. */
    allowed: (tag) => /variant="(inset|raised)"/.test(tag),
    fix: 'the `variant` prop (default, warm, inset, raised)',
  },
  {
    component: "Button",
    allowed: (tag) => /variant="ghost"/.test(tag),
    fix: 'the `variant` prop, or `opaque` for a control that floats over content',
  },
  {
    component: "IconButton",
    /* IconButton defaults to ghost. */
    allowed: (tag) => !/variant="/.test(tag) || /variant="ghost"/.test(tag),
    fix: 'the `variant` prop',
  },
];

/* Read one JSX opening tag, balancing braces and skipping strings, so a
   className built from a template literal or a cx() call is seen whole. */
function openingTags(src, component) {
  const out = [];
  const re = new RegExp(`<${component}(\\s|\\n)`, "g");
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + component.length + 1;
    let depth = 0;
    let quote = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      i++;
    }
    out.push({
      text: src.slice(m.index, i),
      line: src.slice(0, m.index).split("\n").length,
    });
    re.lastIndex = i;
  }
  return out;
}

/* Only the tag's OWN className. A `render={<a><Icon className="h-4"/></a>}`
   prop carries markup of its own, and those classes belong to that element.
   Reading them as this tag's produced eleven false positives the first time
   this check ran. */
function classNamesIn(tag) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < tag.length; i++) {
    const c = tag[i];
    if (quote) {
      if (c === quote && tag[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") { depth++; continue; }
    if (c === "}") { depth--; continue; }
    if (depth !== 0) continue;
    if (!tag.startsWith("className", i)) continue;
    if (/[A-Za-z0-9_$]/.test(tag[i - 1] ?? " ")) continue;
    let j = i + "className".length;
    while (tag[j] === " " || tag[j] === "\n") j++;
    if (tag[j] !== "=") continue;
    j++;
    while (tag[j] === " " || tag[j] === "\n") j++;
    if (tag[j] === '"') {
      return tag.slice(j + 1, tag.indexOf('"', j + 1)).split(/\s+/).filter(Boolean);
    }
    if (tag[j] !== "{") return [];
    let d2 = 0;
    let k = j;
    while (k < tag.length) {
      if (tag[k] === "{") d2++;
      else if (tag[k] === "}") { d2--; if (d2 === 0) break; }
      k++;
    }
    return [...tag.slice(j + 1, k).matchAll(/["'`]([^"'`]*)["'`]/g)]
      .map((x) => x[1])
      .join(" ")
      .split(/\s+/)
      .filter(Boolean);
  }
  return [];
}


/* ------------------------------------------------------------------
   The rules

   Each one is `{ id, title, globs, check(file, text) -> [{ line, message }] }`.
   A rule that returns nothing passes. The runner below turns findings into the
   report; a rule never prints and never exits, which is what lets the test
   suite call each one directly with a planted violation.
   ------------------------------------------------------------------ */

/* Blank out comment bodies while keeping every newline, so line numbers still
   line up afterwards.
 *
 * Whole file rather than per line, which is the bug this replaced. Two rules
 * need to read past a comment, and both did it with a per line regex that only
 * understood a comment opening and closing on the same line. globals.css
 * records the thirteen z index values this scale replaced inside a five line
 * block comment, and the off-scale rule reported the history as a violation.
 *
 * A line comment is only recognised after whitespace or a line start, so the
 * `//` in an https:// URL inside a string is not mistaken for one. */
export function stripComments(text) {
  const blanked = text.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
  return blanked.replace(/(^|\s)\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/* Walk every line of a file, one-based, collecting findings. The shape almost
   every rule wants. */
function byLine(text, fn) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    const message = fn(line, i + 1);
    if (message) found.push({ line: i + 1, message });
  });
  return found;
}

export const RULES = [
  {
    id: "em-dash",
    title: "Rule 1: no em dashes or en dashes used as punctuation",
    /* Markdown counts. The original sweep only covered .ts and .tsx, which is
       exactly how the documentation regression got in. */
    globs: ["*.ts", "*.tsx", "*.md", "*.sql", "*.yml", "*.mjs"],
    skip: (f) => f === "scripts/check-house-rules.mjs",
    check: (file, text) =>
      byLine(text, (line) => {
        if (DASH_STRIPPER.test(line)) return null;
        if (!DASH.test(line)) return null;
        return "em dash or en dash. Use a comma, a period, or restructure.";
      }),
  },

  {
    id: "capsule",
    title: "Rule 9: controls are rounded rectangles, never capsules",
    globs: ["*.tsx"],
    check: (file, text) =>
      byLine(text, (line) => {
        if (!FULL_RADIUS.test(line)) return null;
        // No horizontal padding and not a row, so it is a circle.
        if (!HORIZONTAL_PAD.test(line) && !CAPSULE_ROW.test(line)) return null;
        if (PILL_ALLOWED.some((re) => re.test(line))) return null;
        return "pill shaped control. Controls use --radius-sm through --radius-2xl, never a full radius.";
      }),
  },

  {
    id: "off-scale-token",
    title: "Rule 10: z index and radius come from the token scales",
    globs: ["*.tsx", "*.css"],
    /* An arbitrary value is legitimate when it reaches for a token: the toast
       stack computes its own rung with
       `z-[calc(var(--z-toast)-var(--toast-index))]`, which is on the scale and
       could not be written any other way. So the test is not "is this
       arbitrary" but "does this name a number the scale does not know".

       Deliberately narrower than rule 10 reads. Spacing is the third scale the
       rule names and it is not checked here, because it genuinely is not
       enforced anywhere: globals.css says so in its own comment, py-2.5, px-3.5,
       p-7 and p-9 are scattered through the codebase, and a rule firing on
       hundreds of existing lines would be turned off within the hour. AGENTS.md
       claimed that scale "fails to compile by design", which was not true, and
       that sentence is corrected in the same commit as this rule rather than
       left standing over a check that does not exist. */
    /* globals.css records the thirteen z values this scale replaced, in a
       comment, as the history of what it fixed. Comments are stripped rather
       than the file skipped: making the one file that defines the scale the
       one place this cannot see is exactly backwards. */
    check: (file, text) =>
      byLine(stripComments(text), (line) => {
        for (const m of line.matchAll(/\b(z|rounded)-\[([^\]]+)\]/g)) {
          if (/var\(--|^--/.test(m[2])) continue;
          return m[1] === "z"
            ? `${m[0]} is off the z index scale. Use z-base through z-tooltip.`
            : `${m[0]} is off the radius scale. Use rounded-sm through rounded-2xl, or the --radius-full token for an avatar.`;
        }
        return null;
      }),
  },

  {
    id: "focus-ring-not-defeated",
    title: "Rule 12: nothing may remove the focus ring",
    globs: ["*.tsx", "*.ts", "*.css"],
    /* This rule is deliberately not "flag outline-none", and the reason is
       worth writing down because the obvious version is wrong here.
       
       globals.css draws the product's focus ring from an UNLAYERED rule:
       `:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible`.
       Unlayered CSS beats every cascade layer, and Tailwind emits utilities
       inside `@layer utilities`, so a className of `outline-none` cannot touch
       it. Measured rather than argued: three inputs carrying `outline-none`
       were focused in a real browser and all three computed
       `outline: 2px solid rgb(255, 233, 163)`.
       
       So a rule that flagged `outline-none` would have reported two controls
       that are perfectly accessible and pushed someone into "fixing" them. The
       three things that CAN defeat an unlayered rule are an inline style, an
       important utility, and other unlayered CSS. Those are what this checks. */
    check: (file, text) => {
      const found = [];
      if (file.endsWith(".css")) {
        return byLine(stripComments(text), (line) =>
          /outline:\s*(none|0)\b/.test(line) && !/outline:\s*(none|0)\b.*outline:/.test(line)
            ? "raw CSS removing an outline competes with the global focus ring, which is unlayered. Leave the ring alone."
            : null
        );
      }
      for (const { line, message } of byLine(stripComments(text), (line) => {
        /* An inline style is the one thing a member of this codebase can write
           that outranks an unlayered rule without using !important. */
        if (/outline(?:Style)?:\s*["'`]?(?:none|0)\b/.test(line))
          return "an inline style removing the outline defeats the global focus ring. Remove it.";
        /* An important utility outranks unlayered CSS too. */
        if (/!outline-none|\boutline-none!/.test(line))
          return "an important outline-none defeats the global focus ring. Remove it.";
        return null;
      }))
        found.push({ line, message });
      return found;
    },
  },

  {
    id: "focus-ring-survives-the-cascade",
    title: "Rule 12: the global focus ring exists and stays unlayered",
    globs: ["app/globals.css"],
    /* The load bearing half.
       
       Every interactive element in the product is focus visible because of one
       unlayered rule in this file, and nothing else. Move it inside an
       `@layer`, or delete it, and every `outline-none` in the codebase silently
       starts winning. That is a single edit away from removing the focus ring
       from the entire product, with no other test anywhere that would notice.
       
       So this asserts the rule is present and that it sits outside every layer
       block, which is the property that makes it unbeatable. */
    check: (file, text) => {
      const src = stripComments(text);
      const RING = /:focus-visible\s*\{[^}]*outline:/;
      /* Blank out every @layer block, then look for the ring in what is left. */
      let unlayered = "";
      let i = 0;
      while (i < src.length) {
        const at = src.indexOf("@layer", i);
        if (at === -1) {
          unlayered += src.slice(i);
          break;
        }
        unlayered += src.slice(i, at);
        let j = src.indexOf("{", at);
        const semi = src.indexOf(";", at);
        if (j === -1 || (semi !== -1 && semi < j)) {
          /* `@layer a, b;` declares an order and opens no block. */
          i = semi + 1;
          continue;
        }
        let depth = 0;
        while (j < src.length) {
          if (src[j] === "{") depth++;
          else if (src[j] === "}") {
            depth--;
            if (depth === 0) break;
          }
          j++;
        }
        i = j + 1;
      }

      if (RING.test(unlayered)) return [];
      const line = RING.test(src)
        ? src.slice(0, src.search(RING)).split("\n").length
        : 1;
      return [
        {
          line,
          message: RING.test(src)
            ? "the global :focus-visible ring has moved inside a cascade layer, so every outline-none in the product now beats it. Move it back outside every @layer block."
            : "the global :focus-visible ring is gone. Every interactive element in the product depends on it.",
        },
      ];
    },
  },

  {
    id: "retired-button-utilities",
    title: "Rule 18: the legacy button utilities are retired",
    globs: ["*.tsx"],
    check: (file, text) =>
      byLine(text, (line) => {
        if (!/className=/.test(line)) return null;
        const m = line.match(/\b(btn-gold|btn-glass)\b/);
        if (!m) return null;
        return `${m[1]} is retired. Use the Button primitive from components/ui/button.`;
      }),
  },

  {
    id: "retired-glass-utilities",
    title: "Rule 18: the glass container utilities are retired",
    globs: ["*.tsx"],
    check: (file, text) =>
      byLine(text, (line) => {
        if (!/className=/.test(line)) return null;
        const m = line.match(/\b(glass|glass-sm|glass-warm|glass-hover)\b(?![-\w])/);
        /* `variant="glass"` is the Button's own variant name and is not this. */
        if (!m || /variant\s*[=:]/.test(line)) return null;
        return `.${m[1]} is retired. Use the Card primitive from components/ui/card, which takes a radius prop.`;
      }),
  },

  {
    id: "fill-only-hue-as-text",
    title: "Rule 11: never put text on a fill only hue",
    globs: ["*.tsx"],
    check: (file, text) =>
      byLine(text, (line) => {
        const m = line.match(/\btext-(foe|blood|ash)\b(?!-)/);
        if (!m) return null;
        return `text-${m[1]} fails WCAG AA as text. Use text-${m[1]}-text, or --state-danger.`;
      }),
  },

  {
    id: "retired-gold",
    title: "Rule 13: one gold, not two",
    globs: ["*.ts", "*.tsx", "*.css"],
    skip: (f) => f === "scripts/check-house-rules.mjs",
    check: (file, text) =>
      byLine(stripComments(text), (line) => {
        const m = line.match(RETIRED_GOLD);
        if (!m) return null;
        return `${m[0]} is the retired gold. Use var(--gold) family, or the current hex in Satori rendered images.`;
      }),
  },

  {
    id: "no-green",
    title: "Rule 13: never green in brand surfaces, including success states",
    globs: ["*.tsx", "*.css"],
    check: (file, text) =>
      byLine(text, (line) =>
        /\b(?:text|bg|border|from|to|via)-(?:green|emerald|teal|lime)-\d/.test(line)
          ? "green is never used in brand surfaces. Success is gold."
          : null
      ),
  },

  {
    id: "background-is-a-variant",
    title: "Rule 18: a background is a variant, never a class",
    globs: ["*.tsx"],
    skip: (f) => /^components\/ui\/(card|button)\.tsx$/.test(f),
    check: (file, text) => {
      const found = [];
      for (const { component, allowed, fix } of BACKGROUND_GUARD) {
        for (const { text: tag, line } of openingTags(text, component)) {
          if (allowed(tag)) continue;
          for (const cls of classNamesIn(tag)) {
            /* A state or responsive variant paints over the gradient in its own
               bucket and is a legitimate way to express a hover or a
               breakpoint. */
            if (cls.includes(":")) continue;
            if (!BACKGROUND.test(cls)) continue;
            found.push({
              line,
              message:
                `<${component} className="... ${cls} ..."> cannot work: ` +
                `the variant paints a gradient over it. Use ${fix}.`,
            });
          }
        }
      }
      return found;
    },
  },
];

/* ------------------------------------------------------------------
   The runner
   ------------------------------------------------------------------ */

/* Run every rule over the files it asks for. Returns formatted problems.
   Injectable readers so the tests can run a rule over content that never
   touches disk. */
export function runRules({
  rules = RULES,
  list = files,
  read = (f) => readFileSync(f, "utf8"),
} = {}) {
  const problems = [];
  for (const rule of rules) {
    for (const f of list(rule.globs)) {
      if (rule.skip && rule.skip(f)) continue;
      for (const { line, message } of rule.check(f, read(f)) ?? []) {
        problems.push(`${f}:${line}  ${message}`);
      }
    }
  }
  return problems;
}

/* ------------------------------------------------------------------
   CLI

   Only when invoked as a script. Importing this module runs nothing, which is
   what lets the test suite hold the rules directly.
   ------------------------------------------------------------------ */

/* Identity, not name. The first draft compared argv[1] to the string
   "check-house-rules.mjs", which meant the scan silently did not run whenever
   the file was invoked by any other path: it exited 0 and printed nothing,
   which is indistinguishable from passing. Comparing resolved paths is
   name independent and cannot drift. */
function isMain() {
  if (!argv[1]) return false;
  try {
    return realpathSync(argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

const invokedDirectly = isMain();

if (invokedDirectly) {
  const problems = runRules();

  if (problems.length > 0) {
    console.error(`\nHouse rule violations (${problems.length}):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\nSee AGENTS.md for the rules.\n`);
    process.exit(1);
  }

  /* Say so on success. A gate that prints nothing when it passes is
     indistinguishable from a gate that is broken, which is exactly how a
     checker with an empty rule list sat there exiting 0. Naming the count is
     the cheapest way to notice that the rules themselves went missing. */
  console.log(`House rules: clean. ${RULES.length} rules checked.`);
}
