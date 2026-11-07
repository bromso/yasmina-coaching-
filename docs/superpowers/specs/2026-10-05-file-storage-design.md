# File storage — design

Sub-project B of the feature-parity work (A two-factor → B file storage → C background jobs →
D realtime → E product analytics → F content: `apps/blog` + docs engine → G i18n). Approved in chat
section by section on 2026-10-05.

## Intent

The starter can store user-supplied files behind one seam, runs keyless out of the box, and switches
to any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) by env. It ships two working examples
that exercise both owners of data in the tenant model: a user's **profile photo** and a workspace's
**logo**.

Decided with the owner:

- Examples: **avatar + workspace logo** (no note attachments).
- Transport: **through our servers** — form → server action → `apps/api` → storage seam. No
  presigned uploads, no bucket CORS, works without JavaScript; small images only.

## 1. Storage seam and serving

**Seam** — `apps/api/src/storage/`, shaped like `mail/` and `billing/`:

```ts
interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ body: ReadableStream | Uint8Array; contentType: string; size: number } | null>
  delete(key: string): Promise<void> // a missing key is not an error
}
```

Picked at boot by `createStorage(env)` from `STORAGE_PROVIDER`:

| Provider | Config | Notes |
|---|---|---|
| `local` (default) | `STORAGE_DIR` (default `apps/api/.data/storage`) | keyless; files on disk, content type in a sidecar `<file>.json`; with `NODE_ENV=production` the api warns at startup (fine for one node with a volume, wrong for several) |
| `s3` | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (optional: R2, MinIO…), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Bun's built-in `S3Client`, no SDK; the api exits at startup naming any missing var (endpoint excepted) |

`docker-compose.yml` adds a **MinIO** service (with a one-shot bucket-creating step) and points the
api at it with `STORAGE_PROVIDER=s3`, as Mailpit does for SMTP; its console is published on its own
port. `docker-compose.dev.yml` leaves the api on `local`.

**Keys** — `avatars/<userId>/<random>.<ext>` and `logos/<workspaceId>/<random>.<ext>`; `<random>` is
128 bits, base64url. A key is never reused: replacing writes a new object, commits the new key to
the row, then deletes the old object detached (like mail sends; a failure is logged and reported to
telemetry, never shown to the user).

**Serving** — browsers never call `apps/api`. The signed-in apps (`app`, `auth`, `account`) each get
`src/app/files/[...key]/route.ts`, two lines over `createFileRoute()` from `@repo/session` (shape of
`createTelemetryRoute`). It calls `files.get` with the service token and streams the bytes with:

- the stored `Content-Type`
- `Cache-Control: public, max-age=31536000, immutable` (keys never change)
- `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`
- `Content-Security-Policy: sandbox; default-src 'none'`
- `404` for an unknown key, `502` when the api cannot be reached

The key is the capability: avatars and logos are low-sensitivity, keys are unguessable, and images
stay cacheable, so there is no per-request auth check. When `STORAGE_PUBLIC_URL` is set (a public
R2 bucket or a CDN in front of the bucket), URLs point at `${STORAGE_PUBLIC_URL}/<key>` and the route
is unused.

The contract carries `User.avatarUrl` and `Workspace.logoUrl` (`string | null`), resolved by the api
to `/files/<key>` (relative: each app serves it on its own origin) or the public URL.

## 2. Data, validation and the api

**Data** — migration `0014_files`: `users.avatar_key TEXT NULL`, `workspaces.logo_key TEXT NULL`. No
`files` table: one image per owner needs none; a future attachments feature brings its own.

**Validation** (in `apps/api`, before anything is stored; pure functions in
`apps/api/src/storage/image.ts`):

- type by magic bytes only — PNG, JPEG or WebP; the declared type and file name are ignored; SVG and
  GIF are refused (SVG can carry script)
- at most 2 MB (`MAX_IMAGE_BYTES`); dimensions read from the header, at most 4096 × 4096
  (`MAX_IMAGE_DIMENSION`), so a decompression bomb is refused; a header that cannot be parsed is
  refused
- metadata stripped: JPEG `APP1` (EXIF/XMP) and `APP13` segments, PNG `tEXt` / `iTXt` / `zTXt` /
  `eXIf` chunks, WebP `EXIF` / `XMP ` chunks (and the VP8X flags updated) — so a phone photo does
  not publish its GPS position. No image library, no resizing; the UI sizes with CSS.
- failure: `BAD_REQUEST` "Upload a PNG, JPEG or WebP image up to 2 MB." (exported as
  `IMAGE_UPLOAD_MESSAGE`)

**Procedures** (`@repo/api-contract`; oRPC `File` input over multipart):

| Procedure | Access | Result |
|---|---|---|
| `account.avatar.set({ file })` | ⚑ | `{ avatarUrl }` |
| `account.avatar.remove()` | ⚑ | `{ ok: true }` |
| `workspaces.logo.set({ workspaceId, file })` | ⚑ `member("admin")` | `{ logoUrl }` |
| `workspaces.logo.remove({ workspaceId })` | ⚑ `member("admin")` | `{ ok: true }` |
| `files.get({ key })` | service token only | the bytes + content type |

- `files.get` serves only a key currently referenced by `users.avatar_key` or
  `workspaces.logo_key` (and matching the key pattern); anything else is `NOT_FOUND`, so a replaced
  or removed image stops being served at once (a CDN in front keeps its copy until it expires).
- Limiter `upload:<userId>`, 20 per hour, shared by the two `set` procedures (`TOO_MANY_REQUESTS`
  "Too many uploads, try again later").
- Impersonation: allowed and audited like profile and workspace writes — `user.avatar_set`,
  `user.avatar_removed`, `workspace.logo_set`, `workspace.logo_removed`.
- `workspaces.delete` deletes the logo object after the row (detached).
- `remove` with no image is a no-op success.

**Next side** — `apps/account`'s `next.config.mjs` sets
`experimental.serverActions.bodySizeLimit: "3mb"` (the default 1 MB is below the limit).

## 3. UI, testing, docs

**UI** (every form works without JavaScript):

- `apps/account` Personal info: a **Profile photo** card — the current avatar (or initials from
  `@repo/ui/lib/initials`), a file input (`accept="image/png,image/jpeg,image/webp"`), **Upload**,
  **Remove**; with JavaScript, a local preview before submit. `form-feedback` for messages.
- `apps/account` Workspace: a **Logo** card, same shape, for admin and up; lower roles see it
  read-only.
- `UserMenu` shows the avatar and the workspace switcher the logos, initials as the fallback (in
  `app`, `auth`, `account`); the admin user detail and workspace list show them.
- Plain `<img>` with `width` / `height`, `alt=""` next to a visible name, `loading="lazy"` in lists;
  no `next/image` (it would need a loader configured for the file route).

**Testing**

- api (SQLite + Postgres): PNG, JPEG and WebP accepted; SVG, GIF, oversized, renamed and over-large
  dimensions refused; EXIF actually gone from the stored bytes; replace deletes the old object;
  `files.get` refuses an unreferenced key; logo needs admin; impersonated writes audited; the
  limiter.
- Storage providers: one contract suite run against `local` (temporary directory) and against `s3`
  through a small fake S3 endpoint in the test (via `S3_ENDPOINT`); the same suite runs against a real
  MinIO when `S3_TEST_ENDPOINT` is set (not in CI).
- `image.ts` with fixture files (tiny PNG / JPEG-with-EXIF / WebP / SVG / GIF).
- `createFileRoute` headers and status codes; `apps/account` action cores (fake api).
- e2e: upload an avatar in account and see it in `app`'s `UserMenu`, remove it; upload a workspace
  logo and see it in the switcher.

**Docs** — CLAUDE.md (a **Storage** paragraph; env rows `STORAGE_PROVIDER`, `STORAGE_DIR`,
`STORAGE_PUBLIC_URL`, `S3_*`; Compose's MinIO; e2e counts), `apps/api/README.md` (routes,
migration), `apps/account/README.md`, `packages/session/README.md`, a new `docs/guides/storage.md`
(S3, R2, MinIO, public bucket / CDN, why no CORS is needed), the deploying guide's env table,
`.env.example`, ROADMAP (tick B).

## Out of scope

Large files and presigned uploads; note attachments; resizing and thumbnails; moderation and virus
scanning; per-request access control on files; an orphan sweeper (replacements delete inline).
