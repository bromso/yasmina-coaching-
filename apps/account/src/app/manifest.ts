import { BRAND_NAME } from "@repo/sites"
import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} Account`,
    short_name: "Account",
    description: "Account management shell — frontend boilerplate",
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
