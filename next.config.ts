import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { redirects as redirectRules } from "./src/lib/redirects";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin Turbopack's project root. Do NOT use `__dirname` here.
  //
  // Next transpiles next.config.ts before evaluating it, and in that context
  // `__dirname` resolves to the project's PARENT. Turbopack then resolves every
  // bare specifier from there, so `tailwindcss` becomes unresolvable from
  // postcss.config.mjs — and Turbopack respawns a PostCSS worker per failed
  // transform, unbounded. On one client build that reached 764 node processes
  // (~42 GB) and hard-crashed the host twice. The symptom (hundreds of node
  // processes) points nowhere near the cause, which is why this comment exists.
  //
  // Leaving it unset is not safe either: Next infers the root by walking up for
  // a lockfile, so a stray package-lock.json anywhere above the project — even
  // at the drive root — silently wins, and `next build` only says it "inferred
  // your workspace root, but it may not be correct".
  //
  // `process.cwd()` is right because every Next CLI entry point runs from the
  // directory holding this config — that is how it was found at all. Docs:
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/
  // 01-next-config-js/turbopack.md#root-directory
  turbopack: {
    root: process.cwd(),
  },

  images: {
    // Add remote image domains here when using real product images
    // remotePatterns: [
    //   { protocol: "https", hostname: "cdn.example.com" },
    // ],
  },

  // Ceiling for a single static page's generation, in seconds (default 60).
  // A live catalog behind a PIM/API is slower than the local JSON demo data,
  // and a page that trips the default aborts the whole build.
  staticPageGenerationTimeout: 120,

  // SSG concurrency throttle. A mass `generateStaticParams` over a large
  // catalog can saturate the upstream PIM/API at build time — timeouts, failed
  // builds, and React #419/#441 on the pages that did render. Next's default is
  // 8 pages per worker; drop it (3 is a sane starting point) when you point the
  // repositories at a real API, and tune per project. Left commented because
  // the demo repositories read local files, where throttling only slows builds.
  // See node_modules/next/dist/docs/01-app/03-api-reference/05-config/
  // 01-next-config-js/staticGeneration.md — these options are experimental.
  // experimental: {
  //   staticGenerationMaxConcurrency: 3,
  // },

  // Redirects are defined in src/lib/redirects.ts — edit there.
  async redirects() {
    return redirectRules;
  },
};

export default withNextIntl(nextConfig);
