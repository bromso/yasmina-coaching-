import { ORPCError } from "@orpc/client"
import { createLogger } from "@repo/log"

const logger = createLogger({ service: "auth" })

const SAFE = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox",
}

/** The filename as a safe `Content-Disposition` token: no quotes, slashes or control bytes. */
export const safeCvFilename = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "cv.pdf"

/**
 * The filename as an RFC 5987 `filename*` value (`UTF-8''<percent-encoded>`), so a non-ASCII name
 * (an applicant's own, from the uploaded file) survives alongside the ASCII `filename=` fallback.
 * CR/LF/quotes/slashes/backslashes are stripped first — they would break the header or let a
 * path through — then every byte `encodeURIComponent` leaves unescaped but RFC 5987's `attr-char`
 * still forbids (`'`, `(`, `)`, `*`) is percent-encoded too.
 */
export const extendedCvFilename = (name: string) =>
  `UTF-8''${encodeURIComponent(name.replace(/[\r\n"/\\]/g, "")).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )}`

/**
 * GET /admin/applications/<id>/cv: a job application's stored CV, downloaded by the signed-in
 * superadmin. A bad id, a signed-out caller (`download` is null then), or anything
 * `admin.applications.cv` refuses (not a superadmin, an impersonation session, an unknown id, or
 * a missing object) is a bare `404`, never cached.
 */
export async function cvDownloadResponse(
  download: ((input: { id: number }) => Promise<File>) | null,
  idParam: string | undefined
): Promise<Response> {
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null
  if (!download || id === null) return new Response(null, { status: 404, headers: SAFE })
  try {
    const file = await download({ id })
    return new Response(file.stream(), {
      headers: {
        ...SAFE,
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeCvFilename(file.name)}"; filename*=${extendedCvFilename(file.name)}`,
      },
    })
  } catch (error) {
    if (!(error instanceof ORPCError && error.defined)) {
      logger.error("cv download failed", { error })
    }
    return new Response(null, { status: 404, headers: SAFE })
  }
}
