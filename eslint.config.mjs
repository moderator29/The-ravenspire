import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Style-level compiler hint; the fetch-then-set pattern is intentional.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The deck generator is a standalone CommonJS Node script run by hand, not
    // application code: it never enters the bundle and cannot use the app's
    // module system, so linting it as app code only ever reports that it is
    // what it is. Its own dependencies are installed inside this folder and
    // are not repo dependencies.
    "docs/deck/**",
  ]),
]);

export default eslintConfig;
