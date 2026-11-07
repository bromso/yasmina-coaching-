import bundleAnalyzer from "@next/bundle-analyzer"
import withSerwistInit from "@serwist/next"
import { createMDX } from "fumadocs-mdx/next"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

// Compiles content/jobs/**/*.mdx (source.config.ts) and regenerates .source/ on every dev and build.
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
  // @repo/api-contract is imported by the apply form's action and client (src/lib/apply.ts,
  // src/components/apply-form.tsx), next to @repo/telemetry's own import of it.
  transpilePackages: [
    "@repo/ui",
    "@repo/api-contract",
    "@repo/content",
    "@repo/i18n",
    "@repo/session",
    "@repo/log",
    "@repo/sites",
    "@repo/telemetry",
  ],
  // Empty turbopack config to allow Serwist webpack config alongside Turbopack
  turbopack: {},
  // Enable source maps for production analysis
  productionBrowserSourceMaps: process.env.ANALYZE === "true",
  experimental: {
    // The apply form's server action receives the uploaded CV through FormData (multipart);
    // Next's 1mb default would refuse it before the action's own size check (MAX_CV_BYTES, 5 MB)
    // ever runs.
    serverActions: { bodySizeLimit: "6mb" },
  },
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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "ui.shadcn.com",
      },
    ],
  },
}

export default withBundleAnalyzer(withSerwist(withMDX(nextConfig)))
