import { BRAND_NAME } from "@repo/sites"
import type { MetadataRoute } from "next"
import { ROOT_LOCALE, UI } from "@/content/ui"

export default function manifest(): MetadataRoute.Manifest {
  return {
    // One manifest for both languages: the blog's own Swedish.
    name: `${BRAND_NAME} · ${UI[ROOT_LOCALE].title}`,
    short_name: "Blogg",
    description: UI[ROOT_LOCALE].description,
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
