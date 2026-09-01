import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { redirects as redirectRules } from "./src/lib/redirects";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
