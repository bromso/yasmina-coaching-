import bundleAnalyzer from "@next/bundle-analyzer"
import withSerwistInit from "@serwist/next"
import createNextIntlPlugin from "next-intl/plugin"

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
})

// No routing: the request config reads the locale per request (see src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

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
  transpilePackages: [
    "@repo/ui",
    "@repo/api-contract",
    "@repo/i18n",
    "@repo/ai-contract",
    "@repo/session",
    "@repo/log",
    "@repo/sites",
    "@repo/telemetry",
  ],
  // Empty turbopack config to allow Serwist webpack config alongside Turbopack
  turbopack: {},
  // Enable source maps for production analysis
  productionBrowserSourceMaps: process.env.ANALYZE === "true",
  // Compiler optimizations. Keep console.error/warn: route handlers and server actions log
  // failures that never reach the browser, and stripping them would leave no trace.
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

export default withNextIntl(withBundleAnalyzer(withSerwist(nextConfig)))
