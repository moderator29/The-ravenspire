import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RULES, runRules } from "./check-house-rules.mjs";

/* Every check, watched failing.
 *
 * A check nobody has watched fail is a check nobody knows works. Each rule
 * below is handed a planted violation and asserted to catch it, and handed
 * something innocent and asserted to stay quiet. Both halves matter: a rule
 * that fires on everything gets disabled within a day, and a rule that fires on
 * nothing is decorative.
 *
 * The violations are built rather than typed where the rule would otherwise
 * catch this file. An em dash written literally here would be found by the em
 * dash rule, which globs .mjs, so it is constructed from its code point. That
 * is not a workaround: it also proves the rule matches the real character
 * rather than some literal that happened to be in the source. */

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function rule(id) {
  const found = RULES.find((r) => r.id === id);
  if (!found) throw new Error(`No rule with id ${id}. Did it get renamed?`);
  return found;
}

const check = (id, file, text) => rule(id).check(file, text) ?? [];

describe("the checker itself", () => {
  it("has rules", () => {
    /* The guard that would have caught the empty RULES array a rewrite left
       behind, where the gate exited 0 and printed nothing for anyone who ran
       it. A checker that cannot fail is worse than no checker. */
    expect(RULES.length).toBeGreaterThan(0);
  });

  it("gives every rule an id, a title, globs and a check", () => {
    for (const r of RULES) {
      expect(typeof r.id, `${r.id}`).toBe("string");
      expect(typeof r.title, `${r.id}`).toBe("string");
      expect(Array.isArray(r.globs), `${r.id}`).toBe(true);
      expect(typeof r.check, `${r.id}`).toBe("function");
    }
  });

  it("gives every rule a unique id", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });

  it("reports a finding as file, line and message", () => {
    const problems = runRules({
      rules: [rule("no-green")],
      list: () => ["some/file.tsx"],
      read: () => 'ok\n<p className="text-emerald-500" />\n',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^some\/file\.tsx:2 {2}green is never used/);
  });

  it("honours a rule's own skip", () => {
    const problems = runRules({
      rules: [rule("retired-gold")],
      list: () => ["scripts/check-house-rules.mjs"],
      read: () => "--x: #c8a24c;",
    });
    expect(problems).toEqual([]);
  });
});

describe("rule 1, em dashes", () => {
  it("catches an em dash in prose", () => {
    expect(check("em-dash", "docs/a.md", `a sentence ${EM_DASH} broken`)).toHaveLength(1);
  });

  it("catches an en dash used as punctuation", () => {
    expect(check("em-dash", "docs/a.md", `a sentence ${EN_DASH} broken`)).toHaveLength(1);
  });

  it("leaves the AI output strip filter alone, by shape and not by path", () => {
    /* The one legitimate use: a replace whose pattern is a character class of
       nothing but dashes. Recognising it structurally is what let the allowed
       path list go away. */
    const strip = `.replace(/\\s*[${EM_DASH}${EN_DASH}]\\s*/g, ", ")`;
    expect(check("em-dash", "app/api/x/route.ts", strip)).toEqual([]);
  });

  it("still checks the prose on either side of a file that has a stripper", () => {
    /* The allowed-path version exempted a whole file. This one exempts a line,
       so real prose in the same file is still caught. */
    const src = [
      `.replace(/[${EM_DASH}]/g, ", ")`,
      `/* a comment ${EM_DASH} with a dash */`,
    ].join("\n");
    const found = check("em-dash", "app/api/x/route.ts", src);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("says nothing about ordinary prose", () => {
    expect(check("em-dash", "docs/a.md", "a sentence, restructured.")).toEqual([]);
  });
});

describe("rule 9, capsules", () => {
  it("catches a rounded-full with horizontal padding", () => {
    expect(
      check("capsule", "a.tsx", '<button className="rounded-full px-3">go</button>')
    ).toHaveLength(1);
  });

  it("catches the padding written the long way", () => {
    /* The floating compose bar shipped two pill shaped links as
       `py-2 pl-3.5 pr-2` and the first version of this rule walked past both. */
    expect(
      check("capsule", "a.tsx", '<a className="rounded-full py-2 pl-3.5 pr-2">go</a>')
    ).toHaveLength(1);
  });

  it("catches a capsule whose only padding is the all sides shorthand", () => {
    /* A row of things, not a single glyph, so it is a rail rather than a
       circle. `gap-` is the signal. */
    expect(
      check("capsule", "a.tsx", '<div className="flex gap-0.5 rounded-full p-0.5">')
    ).toHaveLength(1);
  });

  it("catches a capsule written with the realm's own radius token", () => {
    /* Three spellings mean the same thing. The first version of this rule knew
       only Tailwind's, which left the token form unchecked at every call site
       that used it, including the one the primitives themselves write. */
    for (const radius of [
      "rounded-full",
      "rounded-[var(--radius-full)]",
      "rounded-[--radius-full]",
    ]) {
      expect(
        check("capsule", "a.tsx", `<button className="${radius} px-3">go</button>`),
        radius
      ).toHaveLength(1);
    }
  });

  it("leaves the Sheet grab handle alone, which is a bar and not a control", () => {
    /* A deliberate, commented exception in components/ui/sheet.tsx. It has a
       full radius and no horizontal padding, so the existing shape test already
       tells it apart from a capsule without needing to know the file. */
    expect(
      check(
        "capsule",
        "a.tsx",
        '<div className="mx-auto mb-3 h-1 w-10 rounded-[var(--radius-full)] bg-steel-line" />'
      )
    ).toEqual([]);
  });

  it("leaves an avatar written with the token alone", () => {
    expect(
      check("capsule", "a.tsx", '<Avatar className="shrink-0 rounded-[var(--radius-full)]" />')
    ).toEqual([]);
  });

  it("leaves a genuinely circular icon button alone", () => {
    expect(
      check("capsule", "a.tsx", '<IconButton shape="circle" className="rounded-full p-2" />')
    ).toEqual([]);
  });

  it("leaves an avatar and a status dot alone", () => {
    expect(check("capsule", "a.tsx", '<img className="rounded-full" />')).toEqual([]);
    expect(
      check("capsule", "a.tsx", '<span className="h-2 w-2 rounded-full bg-gold" />')
    ).toEqual([]);
  });
});

describe("rule 10, floating chrome names a z rung", () => {
  it("catches a bare z number on a fixed element", () => {
    /* The defect this rule was written after: an aria-modal tour at z-50
       painted under the dock at z-nav (200), fully covered and fully
       claiming nothing else was reachable. `z-50` is not arbitrary syntax,
       so the off-scale-token rule walked straight past it. */
    const found = check(
      "floating-chrome-names-a-z-rung",
      "a.tsx",
      '<div className="fixed inset-0 z-50 flex" />'
    );
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/z-base through z-tooltip/);
  });

  it("catches a bare z number on a sticky element", () => {
    const found = check(
      "floating-chrome-names-a-z-rung",
      "a.tsx",
      '<header className="sticky top-0 z-40" />'
    );
    expect(found).toHaveLength(1);
  });

  it("says nothing about a fixed element on a named rung", () => {
    expect(
      check(
        "floating-chrome-names-a-z-rung",
        "a.tsx",
        '<div className="fixed inset-0 z-modal" />'
      )
    ).toEqual([]);
  });

  it("says nothing about a local z order inside normal flow", () => {
    /* `relative z-10` is a sibling ordering inside a card, is everywhere,
       and is not in the page-wide contest the scale referees. Flagging it
       would fire on dozens of innocent lines and get the rule disabled. */
    expect(
      check(
        "floating-chrome-names-a-z-rung",
        "a.tsx",
        '<span className="relative z-10 flex" />'
      )
    ).toEqual([]);
  });

  it("does not read prose about fixed overlays as a violation", () => {
    const src =
      "/* The old overlay was a fixed inset-0 z-50 div with no trap. */\n" +
      '<div className="fixed inset-0 z-modal" />';
    expect(check("floating-chrome-names-a-z-rung", "a.tsx", src)).toEqual([]);
  });
});

describe("rule 10, the token scales", () => {
  it("catches an arbitrary z index", () => {
    const found = check("off-scale-token", "a.tsx", '<div className="z-[93]" />');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/z index scale/);
  });

  it("catches a one off radius", () => {
    const found = check("off-scale-token", "a.tsx", '<div className="rounded-[13px]" />');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/radius scale/);
  });

  it("allows an arbitrary value that reaches for a token", () => {
    /* The toast stack computes its own rung and could not be written any other
       way, so the test is not "is this arbitrary" but "does this name a number
       the scale does not know". */
    expect(
      check("off-scale-token", "a.tsx", '<div className="z-[calc(var(--z-toast)-var(--toast-index))]" />')
    ).toEqual([]);
    expect(
      check("off-scale-token", "a.tsx", '<div className="rounded-[var(--radius-full)]" />')
    ).toEqual([]);
    /* The bare bracket form is off this rule's beat, but not because it is
       fine. It is broken, and `bare-custom-property-arbitrary-value` is the
       rule that says so. Kept silent here so the author gets one accurate
       message rather than two, one of which would be about the wrong thing. */
    expect(
      check("off-scale-token", "a.tsx", '<div className="rounded-[--radius-2xl]" />')
    ).toEqual([]);
  });

  it("says nothing about a named rung that is on the scale", () => {
    expect(check("off-scale-token", "a.tsx", '<div className="z-toast rounded-xl" />')).toEqual([]);
    for (const r of ["rounded-none", "rounded-sm", "rounded-md", "rounded-lg", "rounded-2xl", "rounded-full"]) {
      expect(check("off-scale-token", "a.tsx", `<div className="${r}" />`), r).toEqual([]);
    }
    /* Corner variants resolve to the same rungs. */
    expect(check("off-scale-token", "a.tsx", '<div className="rounded-t-2xl rounded-br-sm" />')).toEqual([]);
  });

  it("catches a named rung that is off the scale", () => {
    /* The half this rule was missing. `@theme` adds our scale, it does not
       replace Tailwind's, so `rounded-3xl` still resolves and still emits
       24px, which is on no rung of 8/12/16/20/26. Two shipped on the landing
       page while this rule watched, because it only looked inside brackets. */
    for (const r of ["rounded-3xl", "rounded-4xl", "rounded-xs"]) {
      const found = check("off-scale-token", "a.tsx", `<div className="${r}" />`);
      expect(found, r).toHaveLength(1);
      expect(found[0].message, r).toMatch(/off the radius scale/);
    }
  });

  it("catches a bare rounded, which is Tailwind's own 4px", () => {
    const found = check("off-scale-token", "a.tsx", '<div className="rounded border" />');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/4px/);
  });

  it("does not read the word rounded in prose as a class", () => {
    /* Every primitive in this codebase has a comment about clean rounded
       rectangles. Comments are stripped before this rule runs, which is the
       only reason flagging a bare `rounded` is safe at all. */
    const src = "/* This is a rounded rectangle track. */\n<div className=\"rounded-md\" />";
    expect(check("off-scale-token", "a.tsx", src)).toEqual([]);
  });

  it("reads past a comment that spans several lines", () => {
    /* globals.css records the thirteen z values this scale replaced inside a
       five line block comment. The first version of this rule stripped comments
       per line, understood only a comment that opened and closed on one line,
       and reported that history as a live violation. */
    const src = [
      "/* Was thirteen values including",
      "   z-[90], z-[91], z-[95], z-[96]. Seven named rungs now. */",
      "  --z-base: 0;",
    ].join("\n");
    expect(check("off-scale-token", "app/globals.css", src)).toEqual([]);
  });

  it("still catches a live value in a file that also has a comment", () => {
    const src = ["/* history: z-[90] */", '<div className="z-[70]" />'].join("\n");
    const found = check("off-scale-token", "a.tsx", src);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it("does not mistake the slashes in a URL for a comment", () => {
    const src = '<a href="https://example.com/x" className="z-[93]" />';
    expect(check("off-scale-token", "a.tsx", src)).toHaveLength(1);
  });
});

describe("rule 10, a bare custom property in brackets is dropped", () => {
  const RULE = "bare-custom-property-arbitrary-value";

  it("catches the spelling that computes to nothing", () => {
    const found = check(RULE, "a.tsx", '<div className="rounded-[--radius-md]" />');
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/rounded-md/);
  });

  it("catches it on any property, not just radius", () => {
    /* The syntax is what is broken, so the property is incidental. Naming only
       radius here would leave the next one to be found by eye. */
    for (const cls of ["shadow-[--shadow-forge]", "text-[--gold]", "z-[--z-toast]"]) {
      expect(check(RULE, "a.tsx", `<div className="${cls}" />`), cls).toHaveLength(1);
    }
  });

  it("says nothing about the two spellings that work", () => {
    expect(check(RULE, "a.tsx", '<div className="rounded-[var(--radius-md)]" />')).toEqual([]);
    expect(check(RULE, "a.tsx", '<div className="rounded-(--radius-md)" />')).toEqual([]);
  });

  it("says nothing about a named rung or a literal", () => {
    expect(check(RULE, "a.tsx", '<div className="rounded-md z-toast" />')).toEqual([]);
    expect(check(RULE, "a.tsx", '<div className="w-[13px]" />')).toEqual([]);
  });
});

describe("rule 11, fill only hues never carry text", () => {
  it("catches text on a fill only hue", () => {
    expect(check("fill-only-hue-as-text", "a.tsx", '<p className="text-foe">')).toHaveLength(1);
  });

  it("leaves the -text twin alone, which exists for exactly this", () => {
    expect(check("fill-only-hue-as-text", "a.tsx", '<p className="text-foe-text">')).toEqual([]);
  });
});

describe("rule 12, the focus ring", () => {
  it("says nothing about outline-none, which cannot defeat an unlayered rule", () => {
    /* Measured, not argued. Three inputs carrying outline-none were focused in
       a real browser and all three computed a 2px solid gold outline, because
       the global ring is unlayered and Tailwind utilities are not. A rule that
       flagged this would have reported two perfectly accessible controls. */
    expect(
      check("focus-ring-not-defeated", "a.tsx", '<input className="bg-transparent outline-none" />')
    ).toEqual([]);
  });

  it("catches an inline style removing the outline", () => {
    /* An inline style is the one thing a caller can write that outranks an
       unlayered rule without reaching for important. */
    expect(
      check("focus-ring-not-defeated", "a.tsx", '<input style={{ outline: "none" }} />')
    ).toHaveLength(1);
    expect(
      check("focus-ring-not-defeated", "a.tsx", "<input style={{ outlineStyle: 'none' }} />")
    ).toHaveLength(1);
  });

  it("catches an important outline-none, which outranks unlayered CSS", () => {
    expect(
      check("focus-ring-not-defeated", "a.tsx", '<button className="!outline-none" />')
    ).toHaveLength(1);
  });

  it("catches raw CSS removing an outline", () => {
    expect(check("focus-ring-not-defeated", "a.css", "button:focus { outline: none; }")).toHaveLength(1);
  });

  it("accepts the global ring exactly as globals.css writes it", () => {
    const src = [
      "@layer utilities { .outline-none { outline-style: none } }",
      ":where(a, button, input):focus-visible {",
      "  outline: 2px solid var(--state-focus-ring);",
      "}",
    ].join("\n");
    expect(check("focus-ring-survives-the-cascade", "app/globals.css", src)).toEqual([]);
  });

  it("catches the ring being moved inside a layer, which un-protects the product", () => {
    /* One edit away from removing the focus ring from every interactive element
       in the product, with nothing else anywhere that would notice. */
    const src = [
      "@layer base {",
      "  :where(a, button, input):focus-visible {",
      "    outline: 2px solid var(--state-focus-ring);",
      "  }",
      "}",
    ].join("\n");
    const found = check("focus-ring-survives-the-cascade", "app/globals.css", src);
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/inside a cascade layer/);
  });

  it("catches the ring being deleted outright", () => {
    const found = check("focus-ring-survives-the-cascade", "app/globals.css", ":root { --gold: #fff; }");
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/is gone/);
  });

  it("is not fooled by a layer order declaration, which opens no block", () => {
    const src = [
      "@layer theme, base, utilities;",
      ":where(a, button):focus-visible { outline: 2px solid var(--state-focus-ring); }",
    ].join("\n");
    expect(check("focus-ring-survives-the-cascade", "app/globals.css", src)).toEqual([]);
  });
});

describe("rule 22, a 3D icon is never labelled with its own name", () => {
  it("catches a caption that just says the slug", () => {
    const src = '<Icon3D name="chest" size="md" />\n<p>Chest</p>';
    const found = check("no-3d-icon-caption", "a.tsx", src);
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/captioned with its own name/);
  });

  it("catches it however the slug is spaced or cased", () => {
    const src = '<Icon3D name="oath-scroll" />\n<span>Oath Scroll</span>';
    expect(check("no-3d-icon-caption", "a.tsx", src)).toHaveLength(1);
  });

  it("leaves a section kicker beside the icon alone", () => {
    /* The naive version of this rule false positived here, on a real file. A
       kicker containing another element is the section's own title, not the
       icon's label, and the icon sitting with the content it belongs to is
       exactly what the rule asks for. */
    const src = [
      '<Icon3D name="herald-ai" size="lg" priority />',
      "<div>",
      '  <p className="text-gold">',
      '    <Icon name="raven" className="h-4 w-4" />',
      "    The Herald",
      "  </p>",
      "  <h2>Meet @raven</h2>",
      "</div>",
    ].join("\n");
    expect(check("no-3d-icon-caption", "a.tsx", src)).toEqual([]);
  });

  it("leaves copy that says something the slug does not alone", () => {
    const src = '<Icon3D name="chest" />\n<p>Open it to see what the realm left you.</p>';
    expect(check("no-3d-icon-caption", "a.tsx", src)).toEqual([]);
  });

  it("does not read past an element into a later heading", () => {
    const src = '<Icon3D name="trophy" />\n<div><span>x</span></div>\n<h2>Trophy</h2>';
    expect(check("no-3d-icon-caption", "a.tsx", src)).toEqual([]);
  });
});

describe("rule 2, no emoji as icons", () => {
  /* Built from code points so this file does not trip its own rule, the same
     reason the em dash fixtures are built rather than typed. */
  const HEART = String.fromCodePoint(0x2665);
  const FIRE = String.fromCodePoint(0x1f525);

  it("catches an emoji rendered as JSX text", () => {
    expect(
      check("no-emoji-as-icons", "a.tsx", `<span>${FIRE}</span>`)
    ).toHaveLength(1);
  });

  it("catches the glyph that was standing in for a like icon", () => {
    expect(
      check("no-emoji-as-icons", "a.tsx", `<span style={{ color: "#D9B040" }}>${HEART}</span>`)
    ).toHaveLength(1);
  });

  it("catches an emoji in an accessible name, which is the worse case", () => {
    /* A screen reader announces what the emoji is called rather than what the
       control does. */
    const found = check("no-emoji-as-icons", "a.tsx", `<button aria-label="${FIRE} streak" />`);
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/screen reader/);
  });

  it("catches it in the other named props too", () => {
    for (const prop of ["title", "alt", "placeholder"]) {
      expect(
        check("no-emoji-as-icons", "a.tsx", `<img ${prop}="${FIRE}" />`),
        prop
      ).toHaveLength(1);
    }
  });

  it("says nothing about an emoji in a comment, which is prose", () => {
    expect(check("no-emoji-as-icons", "a.tsx", `/* the ${FIRE} icon was here */`)).toEqual([]);
  });

  it("says nothing about the Icon component doing its job", () => {
    expect(check("no-emoji-as-icons", "a.tsx", '<Icon name="flame" className="h-4 w-4" />')).toEqual([]);
  });

  it("says nothing about ordinary words", () => {
    expect(check("no-emoji-as-icons", "a.tsx", "<span>Streak</span>")).toEqual([]);
  });
});

describe("rule 13, one gold and never green", () => {
  it("catches a retired gold hex", () => {
    expect(check("retired-gold", "a.css", "--gold: #d8b45a;")).toHaveLength(1);
  });

  it("leaves the retired value alone inside a comment recording the history", () => {
    /* globals.css names what each token replaced on the same line as the live
       value, and that history is worth keeping. Comments are stripped rather
       than whole lines skipped, so the live value beside it is still read. */
    expect(check("retired-gold", "a.css", "--gold-rich: #ecc860; /* was #d8b45a */")).toEqual([]);
  });

  it("still catches a live retired value on a line that also has a comment", () => {
    expect(
      check("retired-gold", "a.css", "--gold: #c8a24c; /* the brand gold */")
    ).toHaveLength(1);
  });

  it("catches green in any of the utility prefixes", () => {
    for (const cls of ["text-green-500", "bg-emerald-400", "border-teal-300", "from-lime-200"]) {
      expect(check("no-green", "a.tsx", `<p className="${cls}" />`), cls).toHaveLength(1);
    }
  });

  it("says nothing about gold, which is what success uses", () => {
    expect(check("no-green", "a.tsx", '<p className="text-gold" />')).toEqual([]);
  });
});

describe("rule 18, retired utilities and backgrounds", () => {
  it("catches a retired button utility", () => {
    expect(
      check("retired-button-utilities", "a.tsx", '<button className="btn-glass">x</button>')
    ).toHaveLength(1);
  });

  it("leaves a comment explaining what was converted off alone", () => {
    /* Two files mention these names in a comment recording the conversion, and
       that documentation is worth keeping, so the rule wants a className. */
    expect(
      check("retired-button-utilities", "a.tsx", "/* converted off btn-gold */")
    ).toEqual([]);
  });

  it("catches a retired glass utility", () => {
    expect(
      check("retired-glass-utilities", "a.tsx", '<div className="glass-sm p-3" />')
    ).toHaveLength(1);
  });

  it("does not mistake the Button's own glass variant for the retired class", () => {
    expect(
      check("retired-glass-utilities", "a.tsx", '<Button variant="glass" className="p-3" />')
    ).toEqual([]);
  });

  it("catches a background class on a Card, which the gradient would cover", () => {
    expect(
      check("background-is-a-variant", "a.tsx", '<Card className="bg-panel">x</Card>')
    ).toHaveLength(1);
  });

  it("allows a background on the flat variants, which paint no gradient", () => {
    expect(
      check("background-is-a-variant", "a.tsx", '<Card variant="inset" className="bg-panel" />')
    ).toEqual([]);
    expect(
      check("background-is-a-variant", "a.tsx", '<Card variant="raised" className="bg-panel" />')
    ).toEqual([]);
  });

  it("allows a hover or breakpoint background, which lands in its own bucket", () => {
    expect(
      check("background-is-a-variant", "a.tsx", '<Card className="hover:bg-panel" />')
    ).toEqual([]);
  });

  it("does not read a render prop's markup as the tag's own classes", () => {
    /* Reading nested classes as the outer tag's produced eleven false
       positives the first time this rule ran. */
    expect(
      check(
        "background-is-a-variant",
        "a.tsx",
        '<Card render={<a className="bg-panel" />} pad="none">x</Card>'
      )
    ).toEqual([]);
  });
});

describe("the gate always says something", () => {
  /* Two separate claims, deliberately not one test.
   *
   * The first runs against a fixture tree rather than this repository. A test
   * asserting "the clean line appears" only passes while the whole repo is
   * clean, which couples it to everyone else's work in progress: it went red
   * once already because a rule in the same commit was still finding a real
   * violation. The checker enumerates files with `git ls-files`, so a throwaway
   * repository holding one innocent file is all it takes to ask the question
   * properly.
   *
   * The second runs against the real repository and asserts only that the gate
   * is never silent, whichever way it goes. That is the invariant that actually
   * matters and the one that failed before: a rewrite left the rule array empty
   * and the gate exited 0 printing nothing, which is indistinguishable from
   * passing. */

  const CHECKER = resolve("scripts/check-house-rules.mjs");

  it("prints a clean line naming how many rules ran", () => {
    const dir = mkdtempSync(join(tmpdir(), "house-rules-"));
    try {
      execFileSync("git", ["init", "-q", "."], { cwd: dir });
      writeFileSync(join(dir, "innocent.tsx"), 'export const a = <p className="text-gold" />;\n');
      execFileSync("git", ["add", "-A"], { cwd: dir });

      const out = execFileSync("node", [CHECKER], { cwd: dir, encoding: "utf8" });
      expect(out).toMatch(/House rules: clean\. \d+ rules checked\./);
      expect(out).toContain(`${RULES.length} rules checked`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly on a fixture tree that has a violation", () => {
    /* The other half of the same question. A gate nobody has watched fail is a
       gate nobody knows works, and that applies to the runner and the reporting
       as much as it does to any single rule. */
    const dir = mkdtempSync(join(tmpdir(), "house-rules-"));
    try {
      execFileSync("git", ["init", "-q", "."], { cwd: dir });
      writeFileSync(join(dir, "bad.tsx"), '<p className="text-emerald-500" />\n');
      execFileSync("git", ["add", "-A"], { cwd: dir });

      let status = 0;
      let stderr = "";
      try {
        execFileSync("node", [CHECKER], { cwd: dir, encoding: "utf8" });
      } catch (err) {
        status = err.status;
        stderr = String(err.stderr);
      }
      expect(status).toBe(1);
      expect(stderr).toMatch(/House rule violations \(1\)/);
      expect(stderr).toContain("bad.tsx:1");
      expect(stderr).toContain("green is never used");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is never silent on the real repository, whichever way it goes", () => {
    let output = "";
    try {
      output = execFileSync("node", [CHECKER], { encoding: "utf8" });
    } catch (err) {
      output = String(err.stdout) + String(err.stderr);
    }
    expect(output.trim().length).toBeGreaterThan(0);
  });
});

describe("icon names", () => {
  /* The failure these two rules exist to close is not a crash. `Icon` falls
     back to a small empty ring for a name it does not know, so a missing glyph
     renders as something that looks deliberate, and a page full of them looks
     populated. Four of the six House sigils shipped that way, which meant four
     of the six banners were visually identical everywhere in the product. */

  it("catches an Icon name nothing draws", () => {
    const found = check(
      "icon-name-exists",
      "components/thing.tsx",
      '<Icon name="unicorn" className="h-4 w-4" />'
    );
    expect(found.length).toBe(1);
    expect(found[0].message).toMatch(/blank circle/);
  });

  it("stays quiet for a name the set actually draws", () => {
    expect(
      check(
        "icon-name-exists",
        "components/thing.tsx",
        '<Icon name="raven" className="h-4 w-4" />'
      ).length
    ).toBe(0);
  });

  it("stays quiet for a dynamic name it cannot resolve", () => {
    /* A variable name is checked by the sigil rule instead. Firing here would
       make every dynamic icon in the product a violation, and a rule that
       fires on everything gets disabled within a day. */
    expect(
      check("icon-name-exists", "components/thing.tsx", "<Icon name={sigil} />")
        .length
    ).toBe(0);
  });

  it("catches a House sigil nothing draws", () => {
    const found = check(
      "sigil-and-crest-glyphs-exist",
      "lib/data/houses.ts",
      '    sigil: "wyvern",'
    );
    expect(found.length).toBe(1);
  });

  it("accepts the six real House sigils", () => {
    for (const sigil of ["raven", "flame", "snowflake", "storm", "moon", "lion"]) {
      expect(
        check("sigil-and-crest-glyphs-exist", "lib/data/houses.ts", `  sigil: "${sigil}",`),
        sigil
      ).toEqual([]);
    }
  });

  it("checks a crest against the map that actually draws it", () => {
    /* Crests are roundels with their own heavier drawing and their own map.
       Checking them against the shared icon set was this rule's first bug and
       it reported nine perfectly good crests as missing. */
    const file = [
      '  { slug: "x", icon: "laurel" },',
      "const crestIcons = {",
      "  laurel: null,",
      "};",
    ].join("\n");
    expect(
      check("sigil-and-crest-glyphs-exist", "components/brand/crests.tsx", file)
    ).toEqual([]);
  });
});

describe("card-padding-is-a-rung", () => {
  it("catches a card that sets its own padding after opting out of the scale", () => {
    expect(
      check("card-padding-is-a-rung", "a.tsx", '<Card pad="none" className="p-6">x</Card>')
    ).toHaveLength(1);
  });

  it("catches it inside a multi line tag, which is how most of them were written", () => {
    const file = [
      "<Card",
      '  variant="warm"',
      '  pad="none"',
      '  className="mt-5 p-6"',
      ">",
      "  x",
      "</Card>",
    ].join("\n");
    expect(check("card-padding-is-a-rung", "a.tsx", file)).toHaveLength(1);
  });

  it("leaves pad=none alone when the caller adds no padding of its own", () => {
    /* The legitimate use: composing with CardHeader and CardBody, which carry
       their own. A rule that flagged this would push callers back to hand
       padding, which is the opposite of the point. */
    expect(
      check("card-padding-is-a-rung", "a.tsx", '<Card pad="none" className="overflow-hidden" />')
    ).toEqual([]);
  });

  it("allows asymmetric padding, which is not a rung and does not pretend to be", () => {
    expect(
      check("card-padding-is-a-rung", "a.tsx", '<Card pad="none" className="px-3.5 py-2" />')
    ).toEqual([]);
  });

  it("allows a responsive or state variant, which lives in its own bucket", () => {
    expect(
      check("card-padding-is-a-rung", "a.tsx", '<Card pad="none" className="md:p-2" />')
    ).toEqual([]);
  });

  it("does not police a named rung", () => {
    expect(
      check("card-padding-is-a-rung", "a.tsx", '<Card pad="lg" className="p-6" />')
    ).toEqual([]);
  });

  it("leaves the Forge register out of it", () => {
    /* The landing page and the Ceremony are where section 21 allows ornament,
       so a padding chosen there is a decision rather than a card that forgot
       the scale. Driven through runRules rather than the check helper, because
       the exemption lives in the rule's `skip` and the helper calls `check`
       straight through. */
    expect(
      runRules({
        rules: [rule("card-padding-is-a-rung")],
        list: () => ["components/landing/hero.tsx"],
        read: () => '<Card pad="none" className="p-10" />',
      })
    ).toEqual([]);
  });

  it("still polices a Ledger surface through the same path", () => {
    /* The other half of the exemption test. Without this, deleting the whole
       rule body would leave the one above passing. */
    expect(
      runRules({
        rules: [rule("card-padding-is-a-rung")],
        list: () => ["app/(shell)/keep/page.tsx"],
        read: () => '<Card pad="none" className="p-10" />',
      })
    ).toHaveLength(1);
  });
});

describe("hand-rolled-button-has-a-touch-floor", () => {
  it("catches a raw button with no floor", () => {
    expect(
      check("hand-rolled-button-has-a-touch-floor", "a.tsx", '<button className="px-2 py-1">MAX</button>')
    ).toHaveLength(1);
  });

  it("catches one with no className at all", () => {
    expect(
      check("hand-rolled-button-has-a-touch-floor", "a.tsx", '<button type="button">x</button>')
    ).toHaveLength(1);
  });

  it("accepts the pointer keyed floor the primitives use", () => {
    expect(
      check("hand-rolled-button-has-a-touch-floor", "a.tsx", '<button className="touch:min-h-11 touch:min-w-11 px-2">x</button>')
    ).toEqual([]);
  });

  it("accepts a control already tall enough for a thumb on any pointer", () => {
    expect(
      check("hand-rolled-button-has-a-touch-floor", "a.tsx", '<button className="h-12 w-12">x</button>')
    ).toEqual([]);
  });

  it("accepts the inline hit area, for a word inside a line of text", () => {
    /* A min height on an inline control grows the line box and stretches the
       row. The pseudo element grows the target instead and moves nothing. */
    expect(
      check("hand-rolled-button-has-a-touch-floor", "a.tsx", "<button className={`${INLINE_TOUCH_TARGET} text-xs`}>Edit</button>")
    ).toEqual([]);
  });

  it("accepts a full bleed backdrop, which cannot miss a thumb", () => {
    expect(
      check("hand-rolled-button-has-a-touch-floor", "a.tsx", '<button className="absolute inset-0" aria-label="Dismiss" />')
    ).toEqual([]);
  });

  it("does not read markup quoted inside a comment", () => {
    /* This codebase records what a file used to do by quoting the old markup.
       ceremony.tsx explains that its backdrop is no longer a full bleed
       `<button aria-label="Dismiss">`, and a scanner that reads that reports a
       violation whose only fix is to edit the comment into a lie. */
    const file = [
      "/* The backdrop is Dialog.Backdrop rather than a full bleed",
      ' * `<button aria-label="Dismiss">`, which had been a tap target. */',
      "export const x = 1;",
    ].join("\n");
    expect(check("hand-rolled-button-has-a-touch-floor", "a.tsx", file)).toEqual([]);
  });

  it("still reads a real button under a comment holding an apostrophe", () => {
    /* The other half. Blanking comments must not blank the code after them,
       and an apostrophe in prose must not open a quote state that swallows the
       rest of the file: that bug made this rule report a control whose floor
       was written two lines below the comment. */
    const file = [
      "/* Same box as the strip's other cells, so the row reads as one. */",
      '<button className="px-2 py-1">x</button>',
    ].join("\n");
    const found = check("hand-rolled-button-has-a-touch-floor", "a.tsx", file);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });
});
