import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/* Unit tests for the pure logic that decides what members earn.

   The realm had zero tests. The two files under test here are the highest-risk
   pure logic in the product: lib/calls/scoring.ts decides how much permanent
   Renown a Call mints, and lib/points.ts decides the tier ladder and the daily
   social allowance. Both are server-authoritative, both are irreversible once
   they have paid out, and neither is exercised by typecheck.

   components/ui is included for one file, components/ui/merge.ts, which decides
   which of two conflicting classes reaches the browser. It earns a test for the
   same reason: it is pure, typecheck cannot see it, and when it is wrong the
   symptom is a control that silently renders as something else. Every case in
   that suite is a defect that actually shipped. */

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      /* "server-only" is a Next build-time guard with no runtime meaning, and
         Next resolves it through its own alias rather than a real dependency.
         Point it at the empty module Next itself uses for the server bundle so
         a server module can be imported directly in a test. */
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "components/ui/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
});
