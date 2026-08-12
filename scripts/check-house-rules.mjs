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

const problems = [];

/* Rule 1: no em dashes or en dashes used as punctuation, anywhere. Markdown
   counts. The original sweep only covered .ts and .tsx, which is exactly how
   the documentation regression got in. */
for (const f of files(["*.ts", "*.tsx", "*.md", "*.sql", "*.yml", "*.mjs"])) {
  if (f === "scripts/check-house-rules.mjs") continue;
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    if (DASH_STRIPPER.test(line)) return;
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

for (const f of files(["*.ts", "*.tsx", "*.css"])) {
  if (f === "scripts/check-house-rules.mjs") continue;
  const text = readFileSync(f, "utf8");
  text.split("\n").forEach((line, i) => {
    /* globals.css names the retired values in comments, as the history of what
       each token replaced, and that is worth keeping. Skipping the whole file
       to allow it was too blunt: it made globals.css the one place this check
       could never see, which is exactly where a colour regression does the
       most damage.

       Comments are stripped rather than whole lines skipped, because the
       history sits in a TRAILING comment on the token line itself:
         --gold-rich: #ecc860; /* was #d8b45a *\/
       Skipping that line would blind the check to the live value beside it. */
    const code = line.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/, "");
    const m = code.match(RETIRED_GOLD);
    if (m) {
      problems.push(
        `${f}:${i + 1}  ${m[0]} is the retired gold. Use var(--gold) family, or the current hex in Satori rendered images.`
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
