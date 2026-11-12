import bundleAnalyzer from "@next/bundle-analyzer"
import withSerwistInit from "@serwist/next"
import { createMDX } from "fumadocs-mdx/next"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

// Compiles content/pages/*.mdx (source.config.ts) and regenerates .source/ on every dev and build.
const withMDX = createMDX()

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Serwist would reload the page on every "online" event: a blip in the connection would throw away
  // whatever is typed into an open form. Next refetches on the next navigation anyway.
  reloadOnOnline: false,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // @repo/api-contract is not a dependency of the legal app: @repo/telemetry imports it.
  transpilePackages: [
    "@repo/ui",
    "@repo/api-contract",
    "@repo/i18n",
    "@repo/content",
    "@repo/log",
    "@repo/sites",
    "@repo/telemetry",
  ],
  experimental: {
    // The legal app has one root layout per language (src/app/(sv), src/app/(en)), so no layout
    // sits above an unmatched URL: src/app/global-not-found.tsx renders the 404 as a whole
    // document.
    globalNotFound: true,
  },
  // Empty turbopack config to allow Serwist webpack config alongside Turbopack
  turbopack: {},
  // Enable source maps for production analysis
  productionBrowserSourceMaps: process.env.ANALYZE === "true",
  // Tree-shaking optimizations
  modularizeImports: {
    "@iconify/react": {
      transform: "@iconify/react",
      skipDefaultConversion: true,
    },
  },
  // Compiler optimizations. Keep console.error/warn: route handlers and server code log failures
  // that never reach the browser, and stripping them would leave no trace.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
}

export default withBundleAnalyzer(withSerwist(withMDX(nextConfig)))
