import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isPublicSharePath } from "@/lib/share/links";

/* THE GATE, CHECKED AGAINST EVERY ROUTE THAT ACTUALLY EXISTS.
 *
 * `links.test.ts` beside this file tests the matcher against the shapes mission
 * 10 had in mind. This tests it against the shapes the repository really has,
 * which is a different question and the one that goes wrong later.
 *
 * ShellGate opens a path when `isPublicSharePath` says so. Six anchored patterns
 * say so today. The risk is not that those six are wrong, it is that somebody
 * adds `app/(shell)/u/[handle]/vault/page.tsx` in a year and it matches a
 * pattern written for a different purpose, and nothing anywhere fails. A list of
 * private paths typed by hand cannot catch that, because the person adding the
 * route is the same person who would have had to remember to add it to the list.
 *
 * So the route table is READ OFF THE FILESYSTEM. Every `page.tsx` under
 * `app/(shell)` becomes the path it serves, dynamic segments filled with values
 * that are valid for their type, and exactly the six shares may be public. A new
 * route is covered the moment it exists, without anybody remembering anything.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SHELL = `${HERE}../../app/(shell)`;

/* Filled per segment name so the probe is a path the matcher could plausibly
   admit. A uuid segment gets a real uuid: filling it with "x" would make every
   uuid route fail to match for the wrong reason and hide a genuine leak. */
const UUID = "00000000-0000-4000-8000-000000000001";
function fill(segment: string): string {
  const name = segment.slice(1, -1).replace(/^\.\.\./, "");
  if (name === "id") return UUID;
  if (name === "handle") return "phantom";
  if (name === "slug") return "ravens";
  if (name === "address") return "0x0000000000000000000000000000000000000000";
  if (name === "chain") return "base";
  return "probe";
}

function routes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (entry === "page.tsx") {
      out.push(prefix === "" ? "/" : prefix);
      continue;
    }
    if (!statSync(full).isDirectory()) continue;
    /* Route groups add no path segment. */
    const segment = entry.startsWith("(") ? "" : `/${entry.startsWith("[") ? fill(entry) : entry}`;
    out.push(...routes(full, prefix + segment));
  }
  return out;
}

/* The six moments a share link can point at, and nothing else. Written out
   rather than derived, because this is the security decision itself: if this
   list needs editing, that is a deliberate act and it should read like one. */
const PUBLIC = new Set([
  "/u/phantom",
  "/u/phantom/crest/ravens",
  `/calls/${UUID}`,
  "/houses/ravens",
  `/market/${UUID}`,
  `/post/${UUID}`,
  /* The founding round. Deliberate: its share card is meant for strangers,
     and the page shows a sign-in prompt where the controls would be. */
  "/season-zero",
]);

describe("the share gate against the real route table", () => {
  const all = routes(SHELL);

  it("finds the shell routes at all, so an empty sweep cannot pass", () => {
    /* The guard that would catch this test quietly measuring nothing, which is
       how a filesystem-driven check fails: a moved directory makes `all` empty
       and every assertion below passes vacuously. */
    expect(all.length).toBeGreaterThan(30);
    expect(all).toContain("/vault");
    expect(all).toContain("/whispers");
  });

  it("opens every one of the six, and closes every other route in the product", () => {
    const opened = all.filter((p) => isPublicSharePath(p));
    const expected = all.filter((p) => PUBLIC.has(p));
    expect(new Set(opened)).toEqual(new Set(expected));
  });

  it("closes the private routes by name, so the failure reads clearly", () => {
    for (const path of ["/vault", "/wallet", "/settings", "/whispers", "/coffers", "/keep"]) {
      expect(isPublicSharePath(path), path).toBe(false);
    }
  });
});
