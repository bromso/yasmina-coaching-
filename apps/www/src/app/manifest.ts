import { BRAND_NAME } from "@repo/sites"
import type { MetadataRoute } from "next"
import { SITE_META } from "@/content/site-meta"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    // One manifest for both languages: the site's own Swedish.
    description: SITE_META.sv.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fcfaf4",
    theme_color: "#202829",
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
