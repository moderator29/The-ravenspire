import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* The ownership boundary, asserted against the routes themselves.
 *
 * This is the one test here that reads source rather than calling a function,
 * and it is deliberate. The boundary protecting one member's private
 * conversations with the Herald from another member is not a function that can
 * be called: it is the presence of `.eq("profile_id", ...)` on every single
 * query the two routes make.
 *
 * It cannot be delegated to the database either. This stack authenticates with
 * Privy, so auth.uid() is always null, an owner policy written against it would
 * match nothing, and the tables therefore deny every browser role outright and
 * are read exclusively through the service role, which bypasses RLS. That makes
 * the routes the only thing standing between a member and somebody else's
 * conversations, and it makes an unscoped query a silent, total leak rather
 * than a permission error somebody would notice.
 *
 * So the invariant is pinned where it lives. Every statement in these two files
 * that touches a raven_ table must name profile_id. A future edit that adds a
 * handler and forgets the scope fails here instead of shipping. */

const ROUTES = [
  "app/api/raven/conversations/route.ts",
  "app/api/raven/conversations/[id]/route.ts",
  "lib/raven/store.ts",
];

/* Split a file into the Supabase query chains it contains.
 *
 * A chain starts at `.from("raven_...")` and runs to the end of its statement,
 * which is the next semicolon at paren depth zero. Depth matters because a
 * chain contains parentheses and, in the insert calls, an arrow function with
 * its own semicolonless body. */
function queryChains(src: string): { table: string; text: string }[] {
  const out: { table: string; text: string }[] = [];
  const re = /\.from\("(raven_[a-z_]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index;
    let depth = 0;
    let quote: string | null = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
      } else if (c === '"' || c === "'" || c === "`") {
        quote = c;
      } else if (c === "(" || c === "[" || c === "{") {
        depth++;
      } else if (c === ")" || c === "]" || c === "}") {
        depth--;
      } else if (c === ";" && depth === 0) {
        break;
      }
      i++;
    }
    out.push({ table: m[1], text: src.slice(m.index, i) });
  }
  return out;
}

const files = ROUTES.map((path) => ({
  path,
  src: readFileSync(path, "utf8"),
}));

describe("every Herald history query is scoped to its owner", () => {
  it("finds the query chains it means to check", () => {
    /* A parser that silently matched nothing would make every assertion below
       pass while checking exactly nothing, which is the failure mode of a test
       like this one. */
    const total = files.reduce((n, f) => n + queryChains(f.src).length, 0);
    expect(total).toBeGreaterThanOrEqual(10);
  });

  for (const { path } of files) {
    it(`scopes every raven_ query in ${path}`, () => {
      const src = readFileSync(path, "utf8");
      const unscoped = queryChains(src)
        .filter((chain) => !chain.text.includes("profile_id"))
        .map((chain) => `${chain.table}: ${chain.text.slice(0, 90)}`);
      expect(unscoped).toEqual([]);
    });
  }
});

describe("an id belonging to somebody else is not found, not forbidden", () => {
  /* A 403 on another member's conversation id confirms that the id exists,
     which turns the route into a membership oracle over private conversations.
     A 404 tells a member who mistyped and an attacker enumerating the same
     thing. */
  it("never answers 403 from the per-conversation route", () => {
    const src = readFileSync("app/api/raven/conversations/[id]/route.ts", "utf8");
    expect(src).not.toMatch(/,\s*403\s*\)/);
  });

  it("answers not_found when a conversation does not resolve", () => {
    const src = readFileSync("app/api/raven/conversations/[id]/route.ts", "utf8");
    /* Once per handler: read, append, rename, delete. */
    const notFounds = src.match(/"not_found"/g) ?? [];
    expect(notFounds.length).toBeGreaterThanOrEqual(4);
  });
});

describe("every handler requires a member", () => {
  it("resolves a profile before touching the database", () => {
    for (const { path, src } of files) {
      if (path.startsWith("lib/")) continue;
      const handlers = src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? [];
      expect(handlers.length).toBeGreaterThan(0);
      /* One requireProfile per exported handler, and each returns 401 before
         any query runs. */
      const guards = src.match(/await requireProfile\(req\)/g) ?? [];
      expect(guards.length).toBe(handlers.length);
      const unauth = src.match(/"unauthenticated"/g) ?? [];
      expect(unauth.length).toBe(handlers.length);
    }
  });
});
