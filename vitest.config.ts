import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  // tsconfigPaths resolves the `@/*` alias from tsconfig.json so tests can
  // import source modules the same way the app does.
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // `server-only` throws on import outside a React Server bundler; stub it
    // so we can unit-test server modules that guard themselves with it.
    alias: {
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url)
        .pathname,
    },
  },
})
