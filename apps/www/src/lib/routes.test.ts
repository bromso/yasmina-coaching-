import { expect, test } from "bun:test"
import { sitemapFor } from "@repo/sites"
import { PUBLIC_ROUTES } from "./routes"

test("www's sitemap lists the home page, the booking catalog and the legal pages", () => {
  const urls = sitemapFor("www", PUBLIC_ROUTES, { SITE_DOMAIN: "example.com" }).map((e) => e.url)
  expect(urls).toEqual([
    "https://www.example.com/",
    "https://www.example.com/book",
    "https://www.example.com/terms",
    "https://www.example.com/privacy",
  ])
})
