/**
 * The smallest PDF `apps/api`'s `validatePdf` accepts (see `apps/api/src/storage/pdf.test.ts`):
 * a header, a body and a trailer with `%%EOF` inside its lookback window. Used by the api-core
 * scenario's anonymous-forms phase, which calls `jobs.apply` — the api never checks that `job`
 * names a real posting (`apps/jobs`'s postings are static content, not a database row), so any
 * string matching `JOB_SLUG_PATTERN` works.
 */
export const TINY_PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
)

/** A `File` wrapping `TINY_PDF`, ready for `jobs.apply`'s multipart `cv` field. */
export function tinyPdfFile(name = "cv.pdf"): File {
  return new File([TINY_PDF], name, { type: "application/pdf" })
}
