import { describe, expect, mock, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import * as sites from "../packages/sites/src/index"

const { SITES } = sites
// CI runs `bun test scripts` before any install, so workspace packages do not resolve: the
// manifests' one runtime import (`@repo/sites`) is pointed at its source. `next` is type-only there.
mock.module("@repo/sites", () => sites)

// What makes each Next app an installable PWA, checked without a browser. The service worker's
// behaviour (no signed-in data in Cache Storage, the offline page) is apps/e2e/tests/pwa.spec.ts.
const ROOT = join(import.meta.dir, "..")
const APPS = Object.keys(SITES)
/** Pages here show the signed-in user, so their worker caches nothing user-specific. */
const PRIVATE = new Set(["app", "auth", "account"])

type Icon = { src: string; sizes: string; type: string; purpose?: string }
type Manifest = {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  icons: Icon[]
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string) {
  const bytes = readFileSync(path)
  expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG")
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
}

describe.each(APPS)("%s", (app) => {
  const dir = join(ROOT, "apps", app)

  test("its manifest is installable: names, standalone, root scope, 192/512/maskable icons", async () => {
    const manifest = (await import(join(dir, "src/app/manifest.ts"))).default() as Manifest
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.short_name.length).toBeGreaterThan(0)
    expect(manifest).toMatchObject({ start_url: "/", scope: "/", display: "standalone" })
    const sizes = manifest.icons.filter((i) => i.purpose !== "maskable").map((i) => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]))
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true)
    for (const icon of manifest.icons) {
      const file = join(dir, "public", icon.src)
      expect(existsSync(file)).toBe(true)
      expect(icon.type).toBe("image/png")
      expect(pngSize(file)).toBe(icon.sizes)
    }
  })

  test("its service worker uses the shared rules for its kind", () => {
    const sw = readFileSync(join(dir, "src/app/sw.ts"), "utf8")
    const kind = PRIVATE.has(app) ? "private" : "public"
    expect(sw).toContain(`startServiceWorker("${kind}", self.__SW_MANIFEST)`)
  })

  test("it ships the shared offline page", () => {
    const offline = readFileSync(join(dir, "public/offline.html"), "utf8")
    expect(offline).toBe(readFileSync(join(ROOT, "apps/www/public/offline.html"), "utf8"))
  })
})
