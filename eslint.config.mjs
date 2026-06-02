import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The `useEffect(() => setMounted(true), [])` hydration-guard pattern
      // (used to avoid SSR/client mismatches for localStorage-backed stores)
      // sets state once on mount by design. Advisory perf hint here, not a
      // correctness bug — keep it visible as a warning, not an error.
      "react-hooks/set-state-in-effect": "warn",
      // Allow intentionally-unused identifiers prefixed with `_`
      // (e.g. `_req`, `_` in destructures).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
