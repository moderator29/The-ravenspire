import { execFileSync } from "node:child_process";
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

describe("rule 11, fill only hues never carry text", () => {
  it("catches text on a fill only hue", () => {
    expect(check("fill-only-hue-as-text", "a.tsx", '<p className="text-foe">')).toHaveLength(1);
  });

  it("leaves the -text twin alone, which exists for exactly this", () => {
    expect(check("fill-only-hue-as-text", "a.tsx", '<p className="text-foe-text">')).toEqual([]);
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

describe("the gate reports when it passes", () => {
  it("prints a clean line naming how many rules ran", () => {
    /* A gate that prints nothing on success is indistinguishable from a gate
       that is broken. That is not hypothetical: a rewrite left this file with
       an empty rule list, and it exited 0 in silence for everyone who ran it. */
    const out = execFileSync("node", ["scripts/check-house-rules.mjs"], {
      encoding: "utf8",
    });
    expect(out).toMatch(/House rules: clean\. \d+ rules checked\./);
    expect(out).toContain(`${RULES.length} rules checked`);
  });
});
