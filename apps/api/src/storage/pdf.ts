import { MAX_CV_BYTES } from "@repo/api-contract"

/** Thrown by `validatePdf`; `jobs.apply` answers it as `BAD_REQUEST` `CV_UPLOAD_MESSAGE`. */
export class CvRejected extends Error {
  constructor(reason: string) {
    super(`CV rejected: ${reason}`)
    this.name = "CvRejected"
  }
}

const HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
const TRAILER = [0x25, 0x25, 0x45, 0x4f, 0x46] // %%EOF
/** Where `%%EOF` must appear: within this many bytes of the end (PDF readers look there too). */
export const PDF_EOF_WINDOW = 1024

const startsWith = (bytes: Uint8Array, prefix: number[]) =>
  bytes.length >= prefix.length && prefix.every((byte, i) => bytes[i] === byte)

function containsFrom(bytes: Uint8Array, needle: number[], from: number): boolean {
  for (let i = Math.max(0, from); i <= bytes.length - needle.length; i++) {
    if (needle.every((byte, j) => bytes[i + j] === byte)) return true
  }
  return false
}

/**
 * Checks that `bytes` look like a PDF: at most `MAX_CV_BYTES` (checked first), starting with
 * `%PDF-` and holding `%%EOF` within the last `PDF_EOF_WINDOW` bytes. The declared content type
 * and file name are never consulted, so an HTML page, a zip or an executable renamed `.pdf` and
 * sent as `application/pdf` is refused. Throws `CvRejected`; returns nothing on success. The bytes
 * are stored as they are (no rewriting): only a superadmin ever downloads them, as an attachment.
 */
export function validatePdf(bytes: Uint8Array): void {
  if (bytes.length > MAX_CV_BYTES) throw new CvRejected("too large")
  if (!startsWith(bytes, HEADER)) throw new CvRejected("not a PDF")
  if (!containsFrom(bytes, TRAILER, bytes.length - PDF_EOF_WINDOW)) {
    throw new CvRejected("no %%EOF near the end")
  }
}
