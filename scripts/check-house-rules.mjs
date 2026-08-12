/* House rule checker.
 *
 * Two of the founder's rules are absolute and easy to break by accident, and
 * both have already been broken once each after being swept clean: an agent
 * reintroduced nineteen em dashes into a documentation file, and pill shaped
 * chips kept reappearing because the original sweep only understood one of the
 * two ways a chip gets written.
 *
 * Rules enforced by a human noticing are rules that regress. This runs in CI.
 *
 * Usage: npm run check:rules
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DASH = /[—–]/;

/* The one legitimate use of an em dash in the codebase: the character class in
 * the Herald's output filter, which strips them from model output. Deleting it
 * would let the AI reintroduce the very thing the rule forbids. */
const DASH_ALLOWED = new Set(["app/api/compose-suggest/route.ts"]);

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

const problems = [];

/* Rule 1: no em dashes or en dashes used as punctuation, anywhere. Markdown
   counts. The original sweep only covered .ts and .tsx, which is exactly how
   the documentation regression got in. */
for (const f of files(["*.ts", "*.tsx", "*.md", "*.sql", "*.yml", "*.mjs"])) {
  if (DASH_ALLOWED.has(f)) continue;
  if (f === "scripts/check-house-rules.mjs") continue;
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    if (DASH.test(line)) {
      problems.push(
        `${f}:${i + 1}  em dash or en dash. Use a comma, a period, or restructure.`
      );
    }
  });
}

/* Rule 2: buttons, tabs, chips and toggles are clean rounded rectangles.
   A rounded-full carrying horizontal padding is a chip, not a circle.

   Horizontal padding is not only `px-`. The floating compose bar shipped two
   pill shaped links written as `py-2 pl-3.5 pr-2`, and this check walked past
   both of them because it only understood the shorthand. Any of px, pl or pr
   means the control has width beyond its content, which is what makes a
   rounded-full a capsule rather than a circle. */
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

for (const f of files(["*.tsx"])) {
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    if (!line.includes("rounded-full")) return;
    // No horizontal padding and not a row, so it is a circle.
    if (!HORIZONTAL_PAD.test(line) && !CAPSULE_ROW.test(line)) return;
    if (PILL_ALLOWED.some((re) => re.test(line))) return;
    problems.push(
      `${f}:${i + 1}  pill shaped control. Controls use --radius-sm through --radius-2xl, never rounded-full.`
    );
  });
}

/* Rule 2b: the legacy button utilities are retired.

   `.btn-gold` and `.btn-glass` were pasted into 268 hand written buttons, each
   picking its own radius, padding and focus behaviour on top. Every one of
   them is now the Button primitive, and this check is what stops the 269th
   from appearing. The classes still exist in globals.css so nothing breaks
   under an in flight branch, but nothing new may reach for them.

   Matching on `className=` rather than the bare word deliberately: the two
   files that still mention these names do so in a comment explaining what
   they were converted off, which is documentation worth keeping. */
for (const f of files(["*.tsx"])) {
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    if (!/className=/.test(line)) return;
    const m = line.match(/\b(btn-gold|btn-glass)\b/);
    if (m) {
      problems.push(
        `${f}:${i + 1}  ${m[1]} is retired. Use the Button primitive from components/ui/button.`
      );
    }
  });
}

/* Rule 3: never put text on a fill only hue. --foe, --blood and --ash do not
   clear WCAG AA as text and have -text twins for exactly this case. */
for (const f of files(["*.tsx"])) {
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    const m = line.match(/\btext-(foe|blood|ash)\b(?!-)/);
    if (m) {
      problems.push(
        `${f}:${i + 1}  text-${m[1]} fails WCAG AA as text. Use text-${m[1]}-text, or --state-danger.`
      );
    }
  });
}

/* Rule 4: never green in brand surfaces, including success states. */
for (const f of files(["*.tsx", "*.css"])) {
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    if (/\b(?:text|bg|border|from|to|via)-(?:green|emerald|teal|lime)-\d/.test(line)) {
      problems.push(
        `${f}:${i + 1}  green is never used in brand surfaces. Success is gold.`
      );
    }
  });
}

if (problems.length > 0) {
  console.error(`\nHouse rule violations (${problems.length}):\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nSee AGENTS.md for the rules.\n`);
  process.exit(1);
}

console.log("House rules: clean.");
