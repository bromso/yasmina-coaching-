import { ORPCError } from "@orpc/client"
import { ExportIdSchema } from "@repo/api-contract"
import { createLogger } from "@repo/log"

const logger = createLogger({ service: "account" })

const NO_STORE = { "cache-control": "no-store" }

/** The filename as a safe `Content-Disposition` token: no quotes, slashes or control bytes. */
export const safeFilename = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "") || "export.json"

/**
 * GET /data-privacy/export?id=<id>: the signed-in user's ready export, as an attachment named as
 * the api named it, never cached. Signed out, a bad id, or an export that is not (or no longer)
 * available is a bare `404`; the api being unreachable is `502`.
 */
export async function exportDownloadResponse(
  download: ((input: { id: number }) => Promise<File>) | null,
  idParam: string | null
): Promise<Response> {
  const parsed = ExportIdSchema.safeParse({ id: idParam ?? "" })
  if (!download || !parsed.success) return new Response(null, { status: 404, headers: NO_STORE })
  try {
    const file = await download(parsed.data)
    return new Response(file.stream(), {
      headers: {
        ...NO_STORE,
        "content-type": file.type || "application/json",
        "content-disposition": `attachment; filename="${safeFilename(file.name)}"`,
        "x-content-type-options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof ORPCError && error.defined)
      return new Response(null, { status: 404, headers: NO_STORE })
    logger.error("export download failed", { error })
    return new Response(null, { status: 502, headers: NO_STORE })
  }
}
