# File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A storage seam in `apps/api` (keyless local disk, or any S3-compatible bucket) with two
working examples — a user's profile photo and a workspace's logo — uploaded through our own servers
and served from each signed-in app's own origin.

**Architecture:** `apps/api/src/storage/` holds the `Storage` interface, a `local` and an `s3`
provider (Bun's `S3Client`, no SDK) and pure image validation (`image.ts`: magic bytes, dimensions,
metadata stripping). Migration `0014_files` adds `users.avatar_key` / `workspaces.logo_key`; new
procedures upload and remove; `files.get` (service token) serves only referenced keys. Next apps
upload through server actions and serve `/files/<key>` with a two-line route over
`createFileRoute()` from `@repo/session`.

**Tech Stack:** Bun 1.4.2 (`Bun.S3Client`, `Bun.serve`, `bun test`), oRPC 1.15 (`File` input/output
over multipart), Zod 4 (`z.file()`), Next 16.2 server actions, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-file-storage-design.md`

## Global Constraints

- Code style: Biome, double quotes, no semicolons, 2-space indent, 100-char lines; `bunx biome ci .`
  clean with zero warnings.
- Conventional Commits, header ≤ 100 chars, one type per header (commitlint refuses `test(e2e),docs:`);
  every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Accepted types: PNG, JPEG, WebP, by magic bytes only. SVG and GIF refused.
- `MAX_IMAGE_BYTES = 2 * 1024 * 1024`; `MAX_IMAGE_DIMENSION = 4096`.
- Failure copy: `IMAGE_UPLOAD_MESSAGE = "Upload a PNG, JPEG or WebP image up to 2 MB."`
- Limiter copy: `"Too many uploads, try again later"`; limiter `upload:<userId>`, 20 per hour.
- Keys: `avatars/<userId>/<random>.<ext>` and `logos/<workspaceId>/<random>.<ext>`, `<random>` =
  16 random bytes base64url (22 chars), `<ext>` ∈ `png | jpg | webp`.
  `FILE_KEY_PATTERN = /^(avatars|logos)\/[1-9]\d*\/[A-Za-z0-9_-]{22}\.(png|jpg|webp)$/`.
- File route headers: stored `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`,
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`,
  `Content-Security-Policy: sandbox; default-src 'none'`; `404` unknown key, `502` api unreachable.
- Env: `STORAGE_PROVIDER` (`local` default | `s3`), `STORAGE_DIR` (default `apps/api/.data/storage`,
  resolved from the api's working directory as `.data/storage`), `STORAGE_PUBLIC_URL` (optional),
  `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (optional), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- Audit actions: `user.avatar_set`, `user.avatar_removed`, `workspace.logo_set`,
  `workspace.logo_removed`.
- Every form works without JavaScript; `form-feedback` components for messages.
- Never add an npm dependency for images or S3.

**Rulings taken while planning (the spec is the authority; these refine it):**

- The local provider derives the content type from the key's extension instead of a sidecar
  `.json` file — every key carries its validated extension, so a sidecar adds nothing.
- `apps/account`'s `serverActions.bodySizeLimit` is `"10mb"`, not `"3mb"`: the action checks the size
  itself and answers `IMAGE_UPLOAD_MESSAGE`, so a 5 MB photo gets the friendly message instead of
  Next's error page. The api still never receives more than 2 MB from the app.
- The api's `maxRequestBodySize` becomes `max(API_MAX_BODY_BYTES, UPLOAD_MAX_BODY_BYTES)` with
  `UPLOAD_MAX_BODY_BYTES = 3 * 1024 * 1024`; every path except the two upload procedures keeps
  `API_MAX_BODY_BYTES` through a `content-length` check (413). A chunked body without
  `content-length` on another path is bounded by the 3 MB server cap (documented).

## Review Focus

1. **No file chosen** — submitting the form with an empty file input (browsers send a 0-byte `File`
   named `""`) must show "Choose an image." and make no api call. (Task 5)
2. **A truncated or corrupt image** (upload cut off, header lies about length) must be refused with
   `IMAGE_UPLOAD_MESSAGE`, never throw a 500. (Task 2)
3. **Storage write succeeded, database write failed** — the new object must be deleted (best
   effort) so the bucket does not fill with orphans; the user sees an error. (Task 3)
4. **A removed image still referenced by a cached page** — `/files/<key>` answers 404 and the
   `UserMenu` falls back to initials instead of a broken image. (Tasks 4 and 6)
5. **A large but valid photo straight from a phone** (4 MB JPEG) without JavaScript must show
   `IMAGE_UPLOAD_MESSAGE` on the page, not Next's error page. (Task 5)

---

### Task 1: Storage seam (local + s3 providers, env, wiring)

**Files:**
- Create: `apps/api/src/storage/storage.ts`, `apps/api/src/storage/local.ts`,
  `apps/api/src/storage/s3.ts`, `apps/api/src/storage/create-storage.ts`,
  `apps/api/src/storage/storage.test.ts`
- Modify: `apps/api/src/env.ts` (+ `env.test.ts`), `apps/api/src/index.ts`,
  `apps/api/src/server.ts` (`ServerOptions.storage`, Context), `apps/api/src/router.ts` (`Context`),
  `apps/api/.gitignore` (`.data/`), root `.env.example`

**Interfaces:**
- Produces:
  ```ts
  // storage.ts
  export type StoredObject = { body: Uint8Array; contentType: string; size: number }
  export type Storage = {
    kind: "local" | "s3"
    put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
    get(key: string): Promise<StoredObject | null>
    delete(key: string): Promise<void> // a missing key is not an error
  }
  export const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const
  export function contentTypeForKey(key: string): string // by extension; "application/octet-stream" otherwise
  // create-storage.ts
  export type StorageEnv = { STORAGE_PROVIDER: "local" | "s3"; STORAGE_DIR: string; S3_BUCKET?: string;
    S3_REGION?: string; S3_ENDPOINT?: string; S3_ACCESS_KEY_ID?: string; S3_SECRET_ACCESS_KEY?: string }
  export function createStorage(env: StorageEnv): Storage
  ```
  `Context.storage: Storage`; `ServerOptions.storage?: Storage` (defaults to `localStorage` on a temp
  dir in tests — see Step 6). `Env` gains `STORAGE_PROVIDER`, `STORAGE_DIR`, `STORAGE_PUBLIC_URL?`,
  `S3_*`.

- [ ] **Step 1: Write the failing provider contract test**

`apps/api/src/storage/storage.test.ts` runs one suite against `local` (a `mkdtemp` directory) and
against `s3` through a fake S3 endpoint started in the test:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { localStorage } from "./local"
import { s3Storage } from "./s3"
import type { Storage } from "./storage"

/** Path-style fake S3: PUT/GET/HEAD/DELETE on /<bucket>/<key>, keeps Content-Type, ignores auth. */
function fakeS3() {
  const objects = new Map<string, { body: Uint8Array; type: string }>()
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname)
      if (req.method === "PUT") {
        objects.set(path, {
          body: new Uint8Array(await req.arrayBuffer()),
          type: req.headers.get("content-type") ?? "application/octet-stream",
        })
        return new Response(null, { status: 200, headers: { etag: '"x"' } })
      }
      const object = objects.get(path)
      if (req.method === "DELETE") {
        objects.delete(path)
        return new Response(null, { status: 204 })
      }
      if (!object) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 })
      const headers = { "content-type": object.type, "content-length": String(object.body.length), etag: '"x"' }
      return new Response(req.method === "HEAD" ? null : object.body, { headers })
    },
  })
  return { server, objects }
}

const fake = fakeS3()
let dir = ""
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storage-"))
})
afterAll(async () => {
  fake.server.stop(true)
  await rm(dir, { recursive: true, force: true })
})

const providers: [string, () => Storage][] = [
  ["local", () => localStorage(dir)],
  ["s3", () => s3Storage({ bucket: "test", region: "us-east-1", endpoint: `http://localhost:${fake.server.port}`, accessKeyId: "k", secretAccessKey: "s" })],
]
if (process.env.S3_TEST_ENDPOINT) {
  providers.push(["s3 (real)", () => s3Storage({
    bucket: process.env.S3_TEST_BUCKET ?? "uploads", region: process.env.S3_TEST_REGION ?? "us-east-1",
    endpoint: process.env.S3_TEST_ENDPOINT, accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "minioadmin",
    secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "minioadmin" })])
}

for (const [name, make] of providers) {
  describe(`${name} storage`, () => {
    const key = "avatars/1/AAAAAAAAAAAAAAAAAAAAAA.png"
    test("put then get returns the bytes and content type", async () => {
      const storage = make()
      await storage.put(key, new Uint8Array([1, 2, 3]), "image/png")
      const got = await storage.get(key)
      expect(got?.contentType).toBe("image/png")
      expect(got?.size).toBe(3)
      expect([...(got?.body ?? [])]).toEqual([1, 2, 3])
    })
    test("get of a missing key is null", async () => {
      expect(await make().get("avatars/1/BBBBBBBBBBBBBBBBBBBBBB.png")).toBeNull()
    })
    test("delete removes; deleting a missing key does not throw", async () => {
      const storage = make()
      await storage.put(key, new Uint8Array([9]), "image/png")
      await storage.delete(key)
      expect(await storage.get(key)).toBeNull()
      await storage.delete(key)
    })
  })
}

test("local storage refuses a key that escapes its directory", async () => {
  await expect(localStorage(dir).put("../evil.png", new Uint8Array([1]), "image/png")).rejects.toThrow()
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && bun test src/storage/storage.test.ts`
Expected: FAIL — `Cannot find module './local'`.

- [ ] **Step 3: Implement the seam**

`storage.ts`:

```ts
export type StoredObject = { body: Uint8Array; contentType: string; size: number }

/** The seam for user files. Keys are always ours (see FILE_KEY_PATTERN); providers trust them. */
export type Storage = {
  kind: "local" | "s3"
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  /** A missing key is not an error. */
  delete(key: string): Promise<void>
}

export const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const

export function contentTypeForKey(key: string): string {
  const ext = key.slice(key.lastIndexOf(".") + 1)
  return Object.hasOwn(CONTENT_TYPES, ext)
    ? CONTENT_TYPES[ext as keyof typeof CONTENT_TYPES]
    : "application/octet-stream"
}
```

`local.ts`:

```ts
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { contentTypeForKey, type Storage } from "./storage"

/** Files on disk under `root`. The content type comes from the key's (validated) extension. */
export function localStorage(root: string): Storage {
  const base = resolve(root)
  const pathFor = (key: string) => {
    const path = resolve(join(base, key))
    if (!path.startsWith(base + sep)) throw new Error(`storage key escapes its root: ${key}`)
    return path
  }
  return {
    kind: "local",
    async put(key, bytes) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
    },
    async get(key) {
      try {
        const body = new Uint8Array(await readFile(pathFor(key)))
        return { body, contentType: contentTypeForKey(key), size: body.length }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true })
    },
  }
}
```

`s3.ts` (Bun's built-in client; path-style when an endpoint is given):

```ts
import { S3Client } from "bun"
import type { Storage } from "./storage"

export type S3Options = {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
}

export function s3Storage(options: S3Options): Storage {
  const client = new S3Client(options)
  return {
    kind: "s3",
    async put(key, bytes, contentType) {
      await client.write(key, bytes, { type: contentType })
    },
    async get(key) {
      const file = client.file(key)
      if (!(await file.exists())) return null
      const [body, stat] = await Promise.all([file.bytes(), file.stat()])
      return { body, contentType: stat.type, size: body.length }
    },
    async delete(key) {
      await client.delete(key)
    },
  }
}
```

If Bun's `delete` of a missing key throws against the fake or a real bucket, catch the S3 `NoSuchKey`
error there (S3 itself answers 204). `create-storage.ts`:

```ts
import { localStorage } from "./local"
import { s3Storage } from "./s3"
import type { Storage } from "./storage"

export type StorageEnv = {
  STORAGE_PROVIDER: "local" | "s3"
  STORAGE_DIR: string
  S3_BUCKET?: string
  S3_REGION?: string
  S3_ENDPOINT?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
}

/** Picks the provider from env; loadEnv has already refused a half-configured s3. */
export function createStorage(env: StorageEnv): Storage {
  if (env.STORAGE_PROVIDER !== "s3") return localStorage(env.STORAGE_DIR)
  return s3Storage({
    bucket: env.S3_BUCKET as string,
    region: env.S3_REGION as string,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
  })
}
```

- [ ] **Step 4: Env rules (test first)**

Add to `env.test.ts`: default provider is `local` with `STORAGE_DIR` `.data/storage`;
`STORAGE_PROVIDER=s3` without `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
throws `"STORAGE_PROVIDER=s3 needs S3_BUCKET, S3_REGION, …"` naming exactly the missing ones (endpoint
optional); `STORAGE_PUBLIC_URL` must be a URL and has any trailing `/` removed; an unknown provider
throws. Then in `env.ts` schema:

```ts
  // Storage: files on disk by default; any S3-compatible bucket with s3 (see loadEnv).
  STORAGE_PROVIDER: optionalString
    .pipe(z.enum(["local", "s3"]).optional())
    .transform((value) => value ?? "local"),
  STORAGE_DIR: optionalString.transform((value) => value ?? ".data/storage"),
  // Serve files from a public bucket or CDN instead of the apps' /files route.
  STORAGE_PUBLIC_URL: optionalString
    .pipe(z.string().url().optional())
    .transform((value) => value?.replace(/\/+$/, "")),
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ENDPOINT: optionalString.pipe(z.string().url().optional()),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
```

and in `loadEnv`, beside the stripe check:

```ts
  if (env.STORAGE_PROVIDER === "s3") {
    const missing = (["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const)
      .filter((key) => !env[key])
    if (missing.length > 0) throw new Error(`STORAGE_PROVIDER=s3 needs ${missing.join(", ")}`)
  }
```

- [ ] **Step 5: Wire it**

`index.ts`: `const storage = createStorage(env)` next to `createMailer`, pass `storage` to
`createServer`, and beside the `mailer.kind === "log"` warning:

```ts
if (storage.kind === "local" && env.NODE_ENV === "production") {
  console.warn(
    "[api] STORAGE_PROVIDER=local: uploads are on this machine's disk — fine for one node with a volume, lost or split across several"
  )
}
```

`server.ts`: `storage?: Storage` in `ServerOptions` (doc comment: "Where uploads live. Defaults to
files under `.data/storage`."), `const storage = options.storage ?? localStorage(".data/storage")`,
and `storage` into the router context; `router.ts` `Context` gains `storage: Storage`. In
`test-server.ts`'s `start()`, default `storage` to `localStorage(<mkdtemp dir>)` so tests never write
into the repo. `apps/api/.gitignore` gets `.data/`. Root `.env.example` gets the commented storage
block (`# STORAGE_PROVIDER=local`, `# STORAGE_PUBLIC_URL=`, `# S3_BUCKET=` …).

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && bun test src/storage src/env.test.ts && bun run typecheck`
Expected: PASS; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api .env.example
git commit -m "feat(api): storage seam with local and S3 providers"
```

---

### Task 2: Image validation and metadata stripping

**Files:**
- Create: `apps/api/src/storage/image.ts`, `apps/api/src/storage/image.test.ts`
- Create: `packages/api-contract/src/files.ts` (+ export from `index.ts`), `packages/api-contract/src/files.test.ts`

**Interfaces:**
- Produces (contract, `files.ts`):
  ```ts
  export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
  export const MAX_IMAGE_DIMENSION = 4096
  export const IMAGE_UPLOAD_MESSAGE = "Upload a PNG, JPEG or WebP image up to 2 MB."
  export const UPLOAD_RATE_MESSAGE = "Too many uploads, try again later"
  export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp"
  export const FILE_KEY_PATTERN = /^(avatars|logos)\/[1-9]\d*\/[A-Za-z0-9_-]{22}\.(png|jpg|webp)$/
  export const FileKeySchema = z.string().max(200).regex(FILE_KEY_PATTERN)
  ```
- Produces (api, `image.ts`):
  ```ts
  export type ImageExt = "png" | "jpg" | "webp"
  export type ProcessedImage = { bytes: Uint8Array; ext: ImageExt; contentType: string; width: number; height: number }
  /** Null when not a well-formed PNG/JPEG/WebP within the limits. Never throws. */
  export function processImage(input: Uint8Array): ProcessedImage | null
  ```

- [ ] **Step 1: Write the failing tests**

`image.test.ts` builds structurally valid files in code (the parser does not decode pixels or check
CRCs, so synthetic files exercise it exactly):

```ts
import { describe, expect, test } from "bun:test"
import { MAX_IMAGE_BYTES } from "@repo/api-contract"
import { processImage } from "./image"

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat())
const has = (haystack: Uint8Array, needle: string) =>
  Buffer.from(haystack).includes(Buffer.from(needle, "latin1"))

// The real 1×1 PNG (also used by the e2e test).
const PNG_1X1 = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"))
const pngChunk = (type: string, data: number[]) => [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
const png = (w: number, h: number, extra: number[][] = []) => bytes(
  [137, 80, 78, 71, 13, 10, 26, 10],
  pngChunk("IHDR", [...u32be(w), ...u32be(h), 8, 6, 0, 0, 0]),
  ...extra,
  pngChunk("IDAT", [1, 2, 3]),
  pngChunk("IEND", []))

const jpegSeg = (marker: number, data: number[]) => [0xff, marker, ...u32be(data.length + 2).slice(2), ...data]
const jpeg = (w: number, h: number, extra: number[][] = []) => bytes(
  [0xff, 0xd8],
  ...extra,
  jpegSeg(0xdb, new Array(65).fill(1)),
  jpegSeg(0xc0, [8, ...u32be(h).slice(2), ...u32be(w).slice(2), 1, 1, 0x11, 0]),
  jpegSeg(0xda, [1, 1, 0, 0, 0x3f, 0]),
  [0x12, 0x34, 0xff, 0xd9])

const riffChunk = (type: string, data: number[]) =>
  [...ascii(type), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])]
const webp = (chunks: number[][]) => {
  const body = chunks.flat()
  return bytes(ascii("RIFF"), u32le(4 + body.length), ascii("WEBP"), body)
}
const vp8x = (w: number, h: number, flags: number) =>
  riffChunk("VP8X", [flags, 0, 0, 0, ...u32le(w - 1).slice(0, 3), ...u32le(h - 1).slice(0, 3)])
const vp8l = (w: number, h: number) => {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)
  return riffChunk("VP8L", [0x2f, ...u32le(bits), 0])
}

describe("processImage", () => {
  test("accepts the real 1×1 PNG", () => {
    expect(processImage(PNG_1X1)).toMatchObject({ ext: "png", contentType: "image/png", width: 1, height: 1 })
  })
  test("PNG: drops tEXt/iTXt/zTXt/eXIf, keeps the rest", () => {
    const out = processImage(png(4, 3, [pngChunk("tEXt", ascii("GPS\0here")), pngChunk("eXIf", [1, 2])]))
    expect(out?.width).toBe(4)
    expect(has(out!.bytes, "tEXt")).toBe(false)
    expect(has(out!.bytes, "eXIf")).toBe(false)
    expect(has(out!.bytes, "IDAT")).toBe(true)
  })
  test("JPEG: reads the SOF size and drops APP1 (EXIF) and APP13", () => {
    const out = processImage(jpeg(640, 480, [jpegSeg(0xe1, ascii("Exif\0\0GPSDATA")), jpegSeg(0xed, ascii("Photoshop"))]))
    expect(out).toMatchObject({ ext: "jpg", contentType: "image/jpeg", width: 640, height: 480 })
    expect(has(out!.bytes, "GPSDATA")).toBe(false)
    expect(has(out!.bytes, "Photoshop")).toBe(false)
    expect([...out!.bytes.slice(-2)]).toEqual([0xff, 0xd9])
  })
  test("WebP: drops EXIF/XMP chunks, clears their VP8X flags, fixes the RIFF size", () => {
    const out = processImage(webp([vp8x(10, 20, 0x0c), vp8l(10, 20), riffChunk("EXIF", ascii("GPSDATA")), riffChunk("XMP ", ascii("xmp"))]))
    expect(out).toMatchObject({ ext: "webp", width: 10, height: 20 })
    expect(has(out!.bytes, "GPSDATA")).toBe(false)
    expect(out!.bytes[20] & 0x0c).toBe(0)
    const view = new DataView(out!.bytes.buffer, out!.bytes.byteOffset)
    expect(view.getUint32(4, true)).toBe(out!.bytes.length - 8)
  })
  test("refuses SVG, GIF, HTML renamed to .png, and empty input", () => {
    expect(processImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull()
    expect(processImage(bytes(ascii("GIF89a"), [1, 0, 1, 0, 0, 0, 0]))).toBeNull()
    expect(processImage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull()
    expect(processImage(new Uint8Array())).toBeNull()
  })
  test("refuses dimensions over 4096 and zero", () => {
    expect(processImage(png(4097, 10))).toBeNull()
    expect(processImage(jpeg(10, 5000))).toBeNull()
    expect(processImage(png(0, 10))).toBeNull()
  })
  test("refuses truncated files (Review Focus 2)", () => {
    const whole = jpeg(10, 10)
    expect(processImage(whole.subarray(0, 12))).toBeNull()
    expect(processImage(png(4, 4).subarray(0, 30))).toBeNull()
    const lying = png(4, 4)
    lying.set(u32be(0x7fffffff), 33) // IDAT length far past the end
    expect(processImage(lying)).toBeNull()
  })
  test("refuses anything over MAX_IMAGE_BYTES before parsing", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(PNG_1X1)
    expect(processImage(big)).toBeNull()
  })
})
```

Also `packages/api-contract/src/files.test.ts`: `FileKeySchema` accepts
`avatars/1/AAAAAAAAAAAAAAAAAAAAAA.png` and `logos/42/abcdefghijklmnopqrstuv.webp`; refuses
`../avatars/1/x.png`, `avatars/0/AAAAAAAAAAAAAAAAAAAAAA.png`, `avatars/1/AAAAAAAAAAAAAAAAAAAAAA.svg`,
`avatars/1/short.png`, `avatars/1/AAAAAAAAAAAAAAAAAAAAAA.png/x`.

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && bun test src/storage/image.test.ts`
Expected: FAIL — `Cannot find module './image'`.

- [ ] **Step 3: Write `files.ts` in the contract** (the constants above, verbatim), export it from
`packages/api-contract/src/index.ts` (`export * from "./files"`).

- [ ] **Step 4: Implement `image.ts`**

```ts
import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from "@repo/api-contract"
import { CONTENT_TYPES } from "./storage"

export type ImageExt = "png" | "jpg" | "webp"
export type ProcessedImage = {
  bytes: Uint8Array
  ext: ImageExt
  contentType: string
  width: number
  height: number
}

type Parsed = { bytes: Uint8Array; width: number; height: number }

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end))

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf"])

function png(b: Uint8Array): Parsed | null {
  if (b.length < 8 || PNG_SIGNATURE.some((v, k) => b[k] !== v)) return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const parts = [b.subarray(0, 8)]
  let i = 8
  let width = 0
  let height = 0
  while (i + 12 <= b.length) {
    const length = view.getUint32(i)
    const type = ascii(b, i + 4, i + 8)
    const end = i + 12 + length
    if (end > b.length) return null
    if (type === "IHDR") {
      if (length < 8) return null
      width = view.getUint32(i + 8)
      height = view.getUint32(i + 12)
    }
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end))
    i = end
    if (type === "IEND") return width && height ? { bytes: concat(parts), width, height } : null
  }
  return null
}

// SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but do not.
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc
const JPEG_DROP = new Set([0xe1, 0xed]) // APP1 (EXIF, XMP) and APP13 (Photoshop/IPTC)

function jpeg(b: Uint8Array): Parsed | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const parts = [b.subarray(0, 2)]
  let i = 2
  let width = 0
  let height = 0
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) {
      i += 1 // fill byte
      continue
    }
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded data up to EOI, copied as is.
      if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null
      parts.push(b.subarray(i))
      return width && height ? { bytes: concat(parts), width, height } : null
    }
    if (marker === 0xd9) return null // EOI before any scan
    const length = (b[i + 2] << 8) | b[i + 3]
    const end = i + 2 + length
    if (length < 2 || end > b.length) return null
    if (isSof(marker)) {
      if (length < 8) return null
      height = (b[i + 5] << 8) | b[i + 6]
      width = (b[i + 7] << 8) | b[i + 8]
    }
    if (!JPEG_DROP.has(marker)) parts.push(b.subarray(i, end))
    i = end
  }
  return null
}

const WEBP_DROP = new Set(["EXIF", "XMP "])

function webp(b: Uint8Array): Parsed | null {
  if (b.length < 20 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const riffEnd = 8 + view.getUint32(4, true)
  if (riffEnd > b.length) return null
  const parts: Uint8Array[] = []
  let i = 12
  let width = 0
  let height = 0
  let sawImage = false
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, i + 4)
    const size = view.getUint32(i + 4, true)
    const dataEnd = i + 8 + size
    if (dataEnd > riffEnd) return null
    const end = Math.min(dataEnd + (size & 1), riffEnd)
    const d = b.subarray(i + 8, dataEnd)
    if (type === "VP8X") {
      if (size < 10) return null
      width = 1 + (d[4] | (d[5] << 8) | (d[6] << 16))
      height = 1 + (d[7] | (d[8] << 8) | (d[9] << 16))
      const chunk = Uint8Array.from(b.subarray(i, end))
      chunk[8] &= ~0x0c // the EXIF and XMP flags: those chunks are dropped below
      parts.push(chunk)
    } else if (type === "VP8 " || type === "VP8L" || type === "ANMF") {
      sawImage = true
      if (!width && type === "VP8 ") {
        if (size < 10) return null
        width = (d[6] | (d[7] << 8)) & 0x3fff
        height = (d[8] | (d[9] << 8)) & 0x3fff
      } else if (!width && type === "VP8L") {
        if (size < 5 || d[0] !== 0x2f) return null
        const bits = (d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24)) >>> 0
        width = (bits & 0x3fff) + 1
        height = ((bits >>> 14) & 0x3fff) + 1
      }
      parts.push(b.subarray(i, end))
    } else if (!WEBP_DROP.has(type)) {
      parts.push(b.subarray(i, end))
    }
    i = end
  }
  if (!sawImage || !width || !height) return null
  const body = concat(parts)
  const header = new Uint8Array(12)
  header.set([0x52, 0x49, 0x46, 0x46]) // RIFF
  new DataView(header.buffer).setUint32(4, 4 + body.length, true)
  header.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  return { bytes: concat([header, body]), width, height }
}

const PARSERS: [ImageExt, (b: Uint8Array) => Parsed | null][] = [
  ["png", png],
  ["jpg", jpeg],
  ["webp", webp],
]

/**
 * A PNG, JPEG or WebP, by its bytes alone, with metadata (EXIF/GPS, XMP, text chunks) removed.
 * Null for anything else, anything malformed or truncated, over MAX_IMAGE_BYTES, or with a side
 * of 0 or over MAX_IMAGE_DIMENSION. Never throws.
 */
export function processImage(input: Uint8Array): ProcessedImage | null {
  if (input.length === 0 || input.length > MAX_IMAGE_BYTES) return null
  for (const [ext, parse] of PARSERS) {
    let parsed: Parsed | null = null
    try {
      parsed = parse(input)
    } catch {
      return null
    }
    if (!parsed) continue
    const { width, height } = parsed
    if (width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION)
      return null
    return { ...parsed, ext, contentType: CONTENT_TYPES[ext] }
  }
  return null
}
```

(Each parser returns null at once for a signature that is not its own, so trying them in order is
cheap and a PNG is never parsed as a JPEG.)

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && bun test src/storage && cd ../../packages/api-contract && bun test src/files.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storage packages/api-contract/src
git commit -m "feat(api,api-contract): image validation and metadata stripping for uploads"
```

---

### Task 3: Migration, contract and the upload procedures

**Files:**
- Create: `apps/api/src/migrations/0014_files.ts`, `apps/api/src/files.test.ts`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/queries/users.ts`,
  `apps/api/src/queries/workspaces.ts`, `apps/api/src/router.ts`, `apps/api/src/workspaces.ts`,
  `apps/api/src/server.ts` (`uploadLimiter`, `fileUrl`), `apps/api/src/test-server.ts`,
  `packages/api-contract/src/{auth,workspace,admin,index}.ts`, `packages/api-contract/src/files.ts`

**Interfaces:**
- Consumes: `Storage` (Task 1), `processImage`, `IMAGE_UPLOAD_MESSAGE`, `UPLOAD_RATE_MESSAGE`,
  `FILE_KEY_PATTERN` (Task 2).
- Produces:
  - Contract: `UserSchema.avatarUrl: z.string().nullable()`, `WorkspaceSchema.logoUrl:
    z.string().nullable()`, `AdminUserSchema.avatarUrl`, `AdminWorkspaceSchema.logoUrl` (same type).
  - `ImageUploadSchema = z.object({ file: z.file() })`,
    `WorkspaceImageUploadSchema = WorkspaceIdSchema.extend({ file: z.file() })` in `files.ts`.
  - Procedures `account.avatar.set` → `{ avatarUrl: string }`, `account.avatar.remove` →
    `{ ok: true }`, `workspaces.logo.set` → `{ logoUrl: string }`, `workspaces.logo.remove` →
    `{ ok: true }`; errors declared: `BAD_REQUEST` `IMAGE_UPLOAD_MESSAGE`, `TOO_MANY_REQUESTS`
    `UPLOAD_RATE_MESSAGE` (+ the existing `AUTH_ERRORS` / workspace errors for scoped procedures).
  - Route paths: `POST /account/avatar`, `DELETE /account/avatar`,
    `POST /workspaces/{workspaceId}/logo`, `DELETE /workspaces/{workspaceId}/logo`.
  - `Context.fileUrl: (key: string | null) => string | null`; `ServerOptions.storagePublicUrl?: string`.
  - Queries: `users.setAvatarKey(id, key | null): Promise<string | null>` (returns the previous key),
    `workspaces.setLogoKey(id, key | null): Promise<string | null>`,
    `users.hasAvatarKey(key): Promise<boolean>`, `workspaces.hasLogoKey(key): Promise<boolean>`.

- [ ] **Step 1: Migration** — `0014_files.ts`:

```ts
import type { Migration } from "../migrate"

// One image per owner: a nullable storage key on each row is enough (no files table).
const files: Migration = {
  name: "0014_files",
  async up(sql) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN avatar_key TEXT")
    await sql.unsafe("ALTER TABLE workspaces ADD COLUMN logo_key TEXT")
  },
}

export default files
```

List it in `migrations/index.ts` after `twoFactor`; add `avatar_key: string | null` to `UserRow` and
`logo_key: string | null` to `WorkspaceRow`.

- [ ] **Step 2: Write the failing api tests** — `apps/api/src/files.test.ts`, on the real server
(`start()` / `signUp()` from `test-server.ts`, both SQLite and Postgres like the other suites).
Use the `PNG_1X1` bytes from Task 2 (export a `fixtures.ts` helper beside `image.test.ts`:
`export const PNG_1X1`, `export function jpegWithExif()` built as in Task 2's `jpeg()` with an APP1
segment containing `GPSDATA`). Cases:

  1. `account.avatar.set({ file: new File([PNG_1X1], "me.png", { type: "image/png" }) })` →
     `avatarUrl` matches `/^\/files\/avatars\/\d+\/[A-Za-z0-9_-]{22}\.png$/`; `auth.me` returns the
     same `avatarUrl`; the object exists in the test's storage.
  2. JPEG with EXIF → stored bytes (read via the test server's `storage.get`) do not contain
     `GPSDATA`.
  3. SVG named `x.png` with type `image/png` → `BAD_REQUEST` with `IMAGE_UPLOAD_MESSAGE`; nothing
     stored; `avatarUrl` still null.
  4. Replace: set twice → the first key is gone from storage (poll up to 1 s: the delete is
     detached), the second is present.
  5. `account.avatar.remove()` → `avatarUrl` null, object gone; calling it again → `{ ok: true }`.
  6. Storage write OK, database write fails (Review Focus 3): pass a `storage` wrapper to `start()`
     and make `db.users.setAvatarKey` throw once via the returned `db` (monkeypatch for the test) →
     the call fails and the newly written key is deleted from storage.
  7. Logo: a `member` calling `workspaces.logo.set` → `FORBIDDEN` "Requires the admin role"; an admin
     → `logoUrl` set and `workspaces.get` / `workspaces.list` items carry it; a non-member →
     `NOT_FOUND`.
  8. `workspaces.delete` → the logo object is deleted (poll).
  9. Limiter: `start({ uploadLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }) })`;
     second `set` → `TOO_MANY_REQUESTS` with `UPLOAD_RATE_MESSAGE`.
  10. Impersonation: an impersonation session can set an avatar, and an `audit_log` row
      `user.avatar_set` with `impersonated_user_id` = the user exists (follow `impersonation.test.ts`).
  11. `STORAGE_PUBLIC_URL`: `start({ storagePublicUrl: "https://cdn.example.com" })` → `avatarUrl`
      is `https://cdn.example.com/avatars/…`.

- [ ] **Step 3: Run to see them fail**

Run: `cd apps/api && bun test src/files.test.ts`
Expected: FAIL — `account.avatar` is undefined on the client.

- [ ] **Step 4: Contract**

In `files.ts` add:

```ts
export const ImageUploadSchema = z.object({ file: z.file() })
export const ImageUploadErrors = {
  BAD_REQUEST: { message: IMAGE_UPLOAD_MESSAGE },
  TOO_MANY_REQUESTS: { message: UPLOAD_RATE_MESSAGE },
} as const
```

(`WorkspaceImageUploadSchema` in `workspace.ts`, next to `WorkspaceIdSchema`, to avoid a cycle.)
`z.file()` carries no size limit on purpose: the api checks size and answers the declared message,
where a schema `max` would answer an undeclared validation error. Add `avatarUrl` to `UserSchema`
and `AdminUserSchema`, `logoUrl` to `WorkspaceSchema` and `AdminWorkspaceSchema`. Add the four
procedures under `account.avatar` and `workspaces.logo` in `index.ts`, modelled on
`account.updateProfile` and `workspaces.update` (same `route` style, `summary`, errors spread from
the existing groups plus `ImageUploadErrors`).

- [ ] **Step 5: Implement**

`server.ts`: `uploadLimiter?: RateLimiter` (default `createMemoryRateLimiter({ limit: 20, windowMs:
60 * 60_000 })`), `storagePublicUrl?: string`, and

```ts
const fileUrl = (key: string | null) =>
  key === null ? null : options.storagePublicUrl ? `${options.storagePublicUrl}/${key}` : `/files/${key}`
```

into the context (`index.ts` passes `env.STORAGE_PUBLIC_URL`). `toUser(row, superadminEmails)`
becomes `toUser(row, context)`-style or gains a `fileUrl` argument — update every call site;
`toWorkspace` gains `logoUrl` the same way; the admin mappers fill `avatarUrl` / `logoUrl`.

A shared helper in `router.ts` (or a new `apps/api/src/uploads.ts`):

```ts
import { randomBytes } from "node:crypto"

export const newFileKey = (prefix: "avatars" | "logos", ownerId: number, ext: ImageExt) =>
  `${prefix}/${ownerId}/${randomBytes(16).toString("base64url")}.${ext}`

/** Validates, stores, commits the key, then deletes the old object off the response path. */
async function replaceImage(
  context: Context,
  file: File,
  key: (ext: ImageExt) => string,
  commit: (key: string) => Promise<string | null> // returns the previous key
): Promise<string> {
  const image = file.size <= MAX_IMAGE_BYTES ? processImage(new Uint8Array(await file.arrayBuffer())) : null
  if (!image) throw new ORPCError("BAD_REQUEST", { message: IMAGE_UPLOAD_MESSAGE })
  const next = key(image.ext)
  await context.storage.put(next, image.bytes, image.contentType)
  let previous: string | null
  try {
    previous = await commit(next)
  } catch (error) {
    detach(() => context.storage.delete(next), (e) => context.recordFailure("storage.delete", e))
    throw error
  }
  if (previous) {
    detach(() => context.storage.delete(previous), (e) => context.recordFailure("storage.delete", e))
  }
  return next
}
```

(Use the existing `detach` from `mail/mailer.ts` and the context's existing detached-failure
recorder — find its exact name next to `recordFailure` in `server.ts`; keys are not secrets, but
log nothing else from the file.) Handlers:

- `account.avatar.set`: limiter `upload:<userId>` first (`TOO_MANY_REQUESTS` with
  `UPLOAD_RATE_MESSAGE`), then `replaceImage(..., (ext) => newFileKey("avatars", user.id, ext),
  (k) => context.db.users.setAvatarKey(user.id, k))`, then `audit(context, { action:
  "user.avatar_set", targetType: "user", targetId: user.id })`, return `{ avatarUrl: fileUrl(key) }`.
- `account.avatar.remove`: `previous = setAvatarKey(id, null)`; if previous → detached delete +
  audit `user.avatar_removed`; return `{ ok: true }`.
- `workspaces.logo.set` / `remove` behind `member("admin")`, the same with `logos/<workspaceId>`,
  audit `workspace.logo_set` / `workspace.logo_removed` (`targetType: "workspace"`).
- `workspaces.delete`: after the delete commits, if the row had a `logo_key`, detached delete.

Queries (`setAvatarKey` reads the old key and updates in one transaction; same for `setLogoKey`):

```ts
async setAvatarKey(id: number, key: string | null): Promise<string | null> {
  return sql.begin(async (tx) => {
    const [row] = await tx`SELECT avatar_key FROM users WHERE id = ${id}`
    await tx`UPDATE users SET avatar_key = ${key} WHERE id = ${id}`
    return (row?.avatar_key as string | null) ?? null
  })
},
async hasAvatarKey(key: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 AS found FROM users WHERE avatar_key = ${key} LIMIT 1`
  return row !== undefined
},
```

(match the queries files' existing style for transactions and typing.)

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && bun test` (whole api suite — `toUser`/`toWorkspace` changed shape) and
`bun run typecheck` at the root.
Expected: PASS; any test asserting an exact user/workspace object now includes `avatarUrl: null` /
`logoUrl: null` — update those expectations, nothing else.

- [ ] **Step 7: Commit**

```bash
git add apps/api packages/api-contract
git commit -m "feat(api,api-contract): avatar and workspace logo uploads (0014)"
```

---

### Task 4: Serving files — `files.get`, body-size split, `createFileRoute`

**Files:**
- Modify: `apps/api/src/router.ts`, `apps/api/src/server.ts`, `packages/api-contract/src/index.ts`,
  `apps/api/src/files.test.ts`, `apps/api/src/server.test.ts`
- Create: `packages/session/src/files.ts`, `packages/session/src/files.test.ts`
  (+ `"./files": "./src/files.ts"` in `packages/session/package.json` `exports`)
- Create: `apps/{app,auth,account}/src/app/files/[...key]/route.ts`

**Interfaces:**
- Consumes: `FileKeySchema`, `FILE_KEY_PATTERN` (Task 2), `hasAvatarKey` / `hasLogoKey` (Task 3).
- Produces:
  - `files.get({ key })` → `File` (oRPC returns a file response; the client gets a `File` whose
    `type` is the stored content type); errors `NOT_FOUND` "Not found". Service token only — no
    session needed (the route is behind `protect` like every procedure).
  - `export const UPLOAD_MAX_BODY_BYTES = 3 * 1024 * 1024` (api `server.ts`).
  - `export function createFileRoute(options?: { client?: () => Pick<ApiClient, "files"> }):
    (req: Request, ctx: { params: Promise<{ key: string[] }> }) => Promise<Response>`

- [ ] **Step 1: Write the failing tests**

api (`files.test.ts`): `files.get` of a referenced avatar returns the bytes with type `image/png`;
an unreferenced but well-formed key (write one into storage directly) → `NOT_FOUND`; a key that
fails `FILE_KEY_PATTERN` → `BAD_REQUEST` input validation (undeclared is fine); a removed avatar's
key → `NOT_FOUND` at once.

`server.test.ts`: a 1 MB JSON `POST` to `/rpc/notes/create` (any non-upload procedure) with a
correct `content-length` → `413`; a 1.5 MB multipart to `/rpc/account/avatar/set` is not refused by
size (it reaches the handler: `BAD_REQUEST` for the junk bytes, not 413); a 4 MB body anywhere → 413.

`packages/session/src/files.test.ts` (fake client):
```ts
import { describe, expect, test } from "bun:test"
import { createFileRoute } from "./files"

const ctx = (key: string[]) => ({ params: Promise.resolve({ key }) })
const ok = { files: { get: async () => new File([new Uint8Array([1, 2])], "f", { type: "image/png" }) } }

describe("createFileRoute", () => {
  test("streams the file with the cache and safety headers", async () => {
    const res = await createFileRoute({ client: () => ok as never })(new Request("http://x"), ctx(["avatars", "1", "AAAAAAAAAAAAAAAAAAAAAA.png"]))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("content-disposition")).toBe("inline")
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'")
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2])
  })
  test("404 for a malformed key without calling the api", async () => {
    let called = false
    const client = { files: { get: async () => { called = true; throw new Error() } } }
    const res = await createFileRoute({ client: () => client as never })(new Request("http://x"), ctx(["..", "etc", "passwd"]))
    expect(res.status).toBe(404)
    expect(called).toBe(false)
  })
  test("404 when the api says NOT_FOUND, 502 when it cannot be reached", async () => {
    const { ORPCError } = await import("@orpc/client")
    const notFound = { files: { get: async () => { throw new ORPCError("NOT_FOUND", { defined: true }) } } }
    const down = { files: { get: async () => { throw new TypeError("fetch failed") } } }
    const key = ["logos", "2", "AAAAAAAAAAAAAAAAAAAAAA.webp"]
    expect((await createFileRoute({ client: () => notFound as never })(new Request("http://x"), ctx(key))).status).toBe(404)
    expect((await createFileRoute({ client: () => down as never })(new Request("http://x"), ctx(key))).status).toBe(502)
  })
})
```
404 and 502 responses carry `Cache-Control: no-store`.

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && bun test src/files.test.ts src/server.test.ts` and
`cd packages/session && bun test src/files.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Contract: `files: { get: oc.route({ method: "GET", path: "/files/{+key}" }).errors({ NOT_FOUND: {
message: "Not found" } }).input(z.object({ key: FileKeySchema })).output(z.file()) }` (check the
oRPC route-param syntax for a slash-containing param in its OpenAPI docs; if `{+key}` is not
supported, use `POST /files/get` with the key in the body). Handler:

```ts
files: {
  get: api.files.get.handler(async ({ input, context }) => {
    const { key } = input
    const referenced = key.startsWith("avatars/")
      ? await context.db.users.hasAvatarKey(key)
      : await context.db.workspaces.hasLogoKey(key)
    const object = referenced ? await context.storage.get(key) : null
    if (!object) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return new File([object.body], key.slice(key.lastIndexOf("/") + 1), { type: object.contentType })
  }),
},
```

`server.ts`: `maxRequestBodySize: Math.max(options.maxBodyBytes, UPLOAD_MAX_BODY_BYTES)` and a
per-path check inside `protect`'s handler wrapper (before `handle`):

```ts
const UPLOAD_PATHS = new Set(["/rpc/account/avatar/set", "/rpc/workspaces/logo/set"])
const isUpload = (url: URL) =>
  UPLOAD_PATHS.has(url.pathname) ||
  (url.pathname.startsWith("/openapi/") && /\/(avatar|logo)$/.test(url.pathname))
/** Uploads may be UPLOAD_MAX_BODY_BYTES; every other body keeps API_MAX_BODY_BYTES. */
const tooLarge = (req: Request) => {
  const length = Number(req.headers.get("content-length") ?? 0)
  return !isUpload(new URL(req.url)) && length > options.maxBodyBytes
}
```

answering `errorResponse("PAYLOAD_TOO_LARGE", …)` with status 413 (reuse what Bun's own 413 looks
like to clients; check `packages/service-kit`'s error shape for the right helper). Comment that a
chunked body without `content-length` is bounded by the server-wide 3 MB cap.

`packages/session/src/files.ts`:

```ts
import { ORPCError } from "@orpc/client"
import { type ApiClient, FILE_KEY_PATTERN } from "@repo/api-contract"
import { createApiClient } from "./client"
import { loadEnv } from "./env"

const SAFE = {
  "x-content-type-options": "nosniff",
  "content-disposition": "inline",
  "content-security-policy": "sandbox; default-src 'none'",
}

/** GET /files/<key> on the app's own origin: the uploaded image, fetched with the service token. */
export function createFileRoute(options: { client?: () => Pick<ApiClient, "files"> } = {}) {
  const client =
    options.client ??
    (() => {
      const env = loadEnv(["API_URL", "API_SERVICE_TOKEN"])
      return createApiClient({ apiUrl: env.API_URL, serviceToken: env.API_SERVICE_TOKEN })
    })
  return async (_req: Request, ctx: { params: Promise<{ key: string[] }> }) => {
    const key = (await ctx.params).key.join("/")
    if (!FILE_KEY_PATTERN.test(key)) return miss(404)
    try {
      const file = await client().files.get({ key })
      return new Response(file.stream(), {
        headers: {
          ...SAFE,
          "content-type": file.type,
          "content-length": String(file.size),
          "cache-control": "public, max-age=31536000, immutable",
        },
      })
    } catch (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") return miss(404)
      console.error("[files] api unavailable", error)
      return miss(502)
    }
  }
}

const miss = (status: number) =>
  new Response(null, { status, headers: { ...SAFE, "cache-control": "no-store" } })
```

Match `loadEnv`'s real signature and the client's real options (read `env.ts` / `client.ts`).
Each app's `src/app/files/[...key]/route.ts`:

```ts
import { createFileRoute } from "@repo/session/files"

export const GET = createFileRoute()
```

Also check each app's `src/proxy.ts` matcher does not rewrite `/files/*`, and that the private
service worker rules leave `/files/*` alone (they are images: the `private` kind never caches them —
fine, they are immutable and the browser HTTP cache holds them).

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && bun test`, `cd packages/session && bun test`, root `bun run typecheck`, and
`bun --filter @repo/app build` (the new route compiles).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api packages/api-contract packages/session apps/app/src/app/files apps/auth/src/app/files apps/account/src/app/files
git commit -m "feat(api,session): serve uploaded files from each signed-in app's origin"
```

---

### Task 5: Account UI — profile photo and workspace logo

**Files:**
- Create: `apps/account/src/components/image-upload-card.tsx`
- Modify: `apps/account/src/lib/actions.ts` (+ `actions.test.ts`),
  `apps/account/src/lib/workspace-actions.ts` (+ test),
  `apps/account/src/app/(account)/personal-info/actions.ts`,
  `apps/account/src/app/(account)/workspace/actions.ts`,
  `apps/account/src/views/personal-info-view.tsx`, `apps/account/src/views/workspace-view.tsx`,
  `apps/account/src/app/(account)/personal-info/page.tsx`, `.../workspace/page.tsx`,
  `apps/account/next.config.mjs`

**Interfaces:**
- Consumes: `account.avatar.set/remove`, `workspaces.logo.set/remove` (Task 3), `IMAGE_ACCEPT`,
  `MAX_IMAGE_BYTES`, `IMAGE_UPLOAD_MESSAGE` (Task 2); `/files/<key>` served by Task 4.
- Produces: cores `setAvatarCore(deps, fd)`, `removeAvatarCore(deps)`, `setLogoCore(deps, fd)`,
  `removeLogoCore(deps, fd)` → `FormState`; `ImageUploadCard` component.

- [ ] **Step 1: Write the failing core tests** (fake api, the existing `actions.test.ts` style):

  - `setAvatarCore` with no file field, or a 0-byte `File` named `""` → `{ ok: false, fieldErrors:
    { file: "Choose an image." } }`, api not called (Review Focus 1).
  - a `File` over `MAX_IMAGE_BYTES` → `{ ok: false, fieldErrors: { file: IMAGE_UPLOAD_MESSAGE } }`,
    api not called (Review Focus 5).
  - api `BAD_REQUEST` (defined, `IMAGE_UPLOAD_MESSAGE`) → that message as the field error;
    `TOO_MANY_REQUESTS` → form message; success → `{ ok: true, message: "Profile photo updated." }`.
  - `removeAvatarCore` → `{ ok: true, message: "Profile photo removed." }`.
  - `setLogoCore` / `removeLogoCore` read `workspaceId` (the existing `WorkspaceIdSchema` parse used
    by the other workspace cores) and answer "Logo updated." / "Logo removed."; `FORBIDDEN` → form
    message.

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/account && bun test src/lib`
Expected: FAIL — cores not exported.

- [ ] **Step 3: Implement the cores**

```ts
/** The uploaded image from a form; null when no file was chosen (browsers send an empty File). */
export function imageFile(fd: FormData, key = "file"): File | null {
  const v = fd.get(key)
  return v instanceof File && v.size > 0 ? v : null
}

export async function setAvatarCore(deps: ActionDeps, fd: FormData): Promise<FormState> {
  const file = imageFile(fd)
  if (!file) return { ok: false, fieldErrors: { file: "Choose an image." } }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, fieldErrors: { file: IMAGE_UPLOAD_MESSAGE } }
  try {
    await deps.api.avatar.set({ file })
    return { ok: true, message: "Profile photo updated." }
  } catch (error) {
    const known = apiError(error, ["BAD_REQUEST"])
    if (known) return { ok: false, fieldErrors: { file: known.message } }
    return { ok: false, message: failure(error, ["TOO_MANY_REQUESTS"], "setAvatar") }
  }
}
```

(Extend `AccountApi` with `avatar: Pick<ApiClient["account"]["avatar"], "set" | "remove">`; mirror
for logos in `workspace-actions.ts`.) Server actions in the two `actions.ts` files follow
`updateProfile`: `requireUser()`, core, `revalidatePath("/", "layout")` on success (the avatar is in
the shared header).

- [ ] **Step 4: The card** — `image-upload-card.tsx` (`"use client"`, `useActionState` for each of
the two actions, both hooks at the top of the component so a revalidate cannot unmount them):

  - shows the current image (`<img src={url} width={64} height={64} alt="" className="size-16
    rounded-full object-cover">`, square-rounded for logos) or the initials fallback;
  - `<form action={setAction} encType="multipart/form-data">` with `<input type="file" name="file"
    accept={IMAGE_ACCEPT} required>` labelled ("Profile photo" / "Logo"), `fieldAria`, `FieldError`,
    a hint "PNG, JPEG or WebP, up to 2 MB.", hidden `workspaceId` for logos, **Upload** button;
  - with JavaScript: `onChange` shows a local preview (`URL.createObjectURL`, revoked on change and
    unmount) and, when `file.size > MAX_IMAGE_BYTES`, sets the field error client-side;
  - **Remove** as its own small form, shown only when there is an image;
  - `FormMessage` for both states; `readOnly` prop renders the image and a note
    "Only admins can change the logo." with no forms.

Props: `{ kind: "avatar" | "logo"; url: string | null; fallback: string; workspaceId?: number;
readOnly?: boolean; setAction; removeAction }`.

- [ ] **Step 5: Place it** — Personal info view: a **Profile photo** `SettingsCard` above the name
card (`user.avatarUrl`, `initialsOf(user)`). Workspace view: a **Logo** card under the name card;
`readOnly` below `admin` (`roleAtLeast(role, "admin")`). `next.config.mjs`:
`experimental: { serverActions: { bodySizeLimit: "10mb" } }` with a comment pointing at the ruling
(the action answers oversized files itself). Keep any existing `experimental` keys.

- [ ] **Step 6: Run**

Run: `cd apps/account && bun test`, root `bun run typecheck`, `bunx biome ci .`,
`bun --filter @repo/account build`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/account
git commit -m "feat(account): profile photo and workspace logo uploads"
```

---

### Task 6: Show avatars and logos everywhere

**Files:**
- Modify: `packages/ui/src/components/user-menu.tsx` (+ `user-menu.test.tsx`),
  `apps/story/stories/` (the UserMenu story, if one exists),
  `apps/{app,auth}/src/app/layout.tsx`, `apps/account/src/app/(account)/layout.tsx`,
  `apps/auth/src/views/admin-user-view.tsx`, the admin users/workspaces list views in `apps/auth`

**Interfaces:**
- Consumes: `User.avatarUrl`, `WorkspaceSummary.logoUrl`, `AdminUser.avatarUrl`,
  `AdminWorkspace.logoUrl` (Task 3).
- Produces: `UserMenuProps.user: { name: string; email: string; avatarUrl?: string | null }`;
  `UserMenuWorkspaces.items: { id: number; name: string; logoUrl?: string | null }[]`.

- [ ] **Step 1: Failing test** in `user-menu.test.tsx`: with `avatarUrl`, the trigger renders an
`img` with that `src` and `alt=""` (the button keeps its accessible name); without it, initials;
workspace items with `logoUrl` render a small `img`, without it a letter tile.

- [ ] **Step 2: Run to see it fail** — `cd packages/ui && bun test src/components/user-menu.test.tsx`.

- [ ] **Step 3: Implement** — use the existing `AvatarImage` from `@repo/ui/components/avatar`
inside `Avatar`, before `AvatarFallback`, so a 404 (a removed image on a stale page) falls back to
initials (Review Focus 4). Workspace items: `<img src={logoUrl} width={16} height={16} alt=""
className="size-4 rounded-sm object-cover">` or a tile with the first letter. Pass the new fields
from the three layouts (`user.avatarUrl`, `items.map(({ id, name, logoUrl }) => …)`). Admin user
detail: the avatar next to the name; admin users list and workspaces list: a 24 px image with
`loading="lazy"`.

- [ ] **Step 4: Run** — `cd packages/ui && bun test`, `bun run --filter @repo/ui typecheck`, root
`bun run typecheck`, `bunx biome ci .`.

- [ ] **Step 5: Commit**

```bash
git add packages/ui apps/app apps/auth apps/account apps/story
git commit -m "feat(ui,app,auth,account): show avatars and workspace logos"
```

---

### Task 7: Compose MinIO, e2e journey, docs

**Files:**
- Modify: `docker-compose.yml`, `scripts/docker.test.ts` (only if it needs to know about non-app
  services), `apps/e2e/e2e.env.ts`, `apps/e2e/playwright.config.ts` (if the api env is built there),
  `.gitignore` / `apps/e2e/.gitignore` (`.tmp` already ignored — verify)
- Create: `apps/e2e/tests/uploads.spec.ts`, `apps/e2e/fixtures/images.ts`, `docs/guides/storage.md`
- Modify (docs): `CLAUDE.md`, `apps/api/README.md`, `apps/account/README.md`,
  `packages/session/README.md`, `apps/e2e/README.md`, `docs/guides/deploying.md`, `docs/ROADMAP.md`,
  root `.env.example`

- [ ] **Step 1: Compose** — in `docker-compose.yml`:

```yaml
  minio:
    image: minio/minio:RELEASE.2025-09-07T16-13-09Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: "${S3_ACCESS_KEY_ID:-minioadmin}"
      MINIO_ROOT_PASSWORD: "${S3_SECRET_ACCESS_KEY:-minioadmin}"
    ports: ["9000:9000", "9001:9001"]
    volumes: ["minio-data:/data"]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      retries: 10
  minio-init:
    image: minio/mc:RELEASE.2025-08-13T08-35-41Z
    depends_on: { minio: { condition: service_healthy } }
    entrypoint: >
      sh -c "mc alias set local http://minio:9000 $${MINIO_ROOT_USER} $${MINIO_ROOT_PASSWORD} &&
             mc mb --ignore-existing local/uploads"
    environment:
      MINIO_ROOT_USER: "${S3_ACCESS_KEY_ID:-minioadmin}"
      MINIO_ROOT_PASSWORD: "${S3_SECRET_ACCESS_KEY:-minioadmin}"
```

(pin to current tags — check Docker Hub for the latest `RELEASE.*` of each); the api service gets
`STORAGE_PROVIDER: s3`, `S3_ENDPOINT: http://minio:9000`, `S3_BUCKET: uploads`, `S3_REGION:
us-east-1`, the two keys with the same defaults, and `depends_on: minio-init: { condition:
service_completed_successfully }`; add the `minio-data` volume. Run `bun test scripts` — if
`docker.test.ts` assumes every service is an app, teach it to skip `minio` / `minio-init` like
`mailpit`. Smoke it if Docker has room (ask before pruning anything that is not this repo's):
`docker compose up -d --build api minio minio-init` then upload through the account app is covered by
the e2e locally; at least confirm the api boots healthy against MinIO.

- [ ] **Step 2: e2e** — `e2e.env.ts`: the api runs with `STORAGE_PROVIDER: "local"`,
`STORAGE_DIR: join(TMP, "storage")`. `fixtures/images.ts` exports `PNG_1X1` (the base64 from Task 2)
as a `Buffer`. `tests/uploads.spec.ts`:

  1. sign up + verify (`signUpVerified`), sign in; account `/personal-info` → set the file input with
     `page.setInputFiles` (`{ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 }`) → **Upload**
     → "Profile photo updated."; the header's user-menu trigger contains an `img` whose `src` starts
     with `/files/avatars/` and whose `naturalWidth` is 1 (the bytes were served); open `app`'s
     `/notes` (create a workspace first via the existing helper if the page needs one) → the
     user-menu `img` is there too; **Remove** → the trigger shows initials again.
  2. as the workspace owner, account `/workspace` → upload a logo → "Logo updated."; open the user
     menu → the workspace item shows an `img` with `src` starting `/files/logos/`.
  3. uploading `{ name: "x.png", mimeType: "image/png", buffer: Buffer.from("<svg/>") }` shows
     `IMAGE_UPLOAD_MESSAGE`.

- [ ] **Step 3: Docs**

  - CLAUDE.md:
    - a **Storage.** paragraph under Authentication's siblings, in the house style: the seam and
      its providers, keys, the file route and its headers, `files.get` serving only referenced keys,
      validation rules and copy, metadata stripping, the limiter, audit actions, migration `0014_files`,
      the body-size split, the account body limit ruling, Compose MinIO, `docs/guides/storage.md`
    - env-table rows: `STORAGE_PROVIDER` (api, `local`, `s3` or `local` with a volume — the api warns),
      `STORAGE_DIR`, `STORAGE_PUBLIC_URL`, `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`
      (required iff `s3`), `S3_ENDPOINT` (optional)
    - the Docker paragraph: MinIO, its ports 9000/9001
    - "Adding a new subdomain app" step 6: copy `src/app/files/[...key]/route.ts` if the app
      shows avatars
    - the e2e counts (run `cd apps/e2e && CI=1 bunx playwright test --list` for the real numbers)
    - the `apps/account` bullet (profile photo, logo)
  - `apps/api/README.md`: route rows for the five procedures, `0014`, the storage section.
  - `apps/account/README.md`, `packages/session/README.md` (`createFileRoute`), `apps/e2e/README.md`.
  - `docs/guides/storage.md`: choosing a provider; AWS S3 (bucket, IAM policy with only
    `s3:PutObject`/`s3:GetObject`/`s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`); Cloudflare R2
    (`S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`); MinIO; serving
    from a public bucket or CDN with `STORAGE_PUBLIC_URL` (and that removed images then linger until
    the CDN expires them); why no bucket CORS is needed; backups are the bucket's job.
  - `docs/guides/deploying.md` env table rows; `.env.example`; ROADMAP: tick **B File storage**.

- [ ] **Step 4: Full gate**

Run: `bun run ci` (exit 0), then `bun --filter @repo/e2e e2e` (or build www/app/auth/account and
`cd apps/e2e && CI=1 bunx playwright test --retries=0`) — every test passes.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml scripts apps/e2e docs CLAUDE.md apps/api/README.md apps/account/README.md packages/session/README.md .env.example
git commit -m "test(e2e): upload journey; MinIO in Compose and the storage docs"
```
