import { S3Client } from "bun"
import { contentTypeForKey, type ListedObject, type Storage } from "./storage"

export type S3Options = {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
}

// Bun's S3Client throws an `S3Error` with a `code` (e.g. "NoSuchKey", "AccessDenied") on a real
// endpoint; matched on `code` first, falling back to the message text for whatever a
// not-quite-compliant S3-compatible endpoint sends instead. Shared by `get` and `delete`, which
// only a real endpoint confirms: run storage.test.ts with S3_TEST_ENDPOINT set (SeaweedFS, R2…).
function s3ErrorText(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : error.message
}

function isNotFound(error: unknown): boolean {
  const text = s3ErrorText(error)
  return text != null && /no.?such.?key/i.test(text)
}

function isForbidden(error: unknown): boolean {
  const text = s3ErrorText(error)
  return text != null && /access.?denied|forbidden|\b403\b/i.test(text)
}

export function s3Storage(
  options: S3Options & { onForbidden?: (key: string, error: unknown) => void }
): Storage {
  const client = new S3Client(options)
  return {
    kind: "s3",
    async put(key, bytes, contentType) {
      await client.write(key, bytes, { type: contentType })
    },
    async get(key) {
      try {
        const body = await client.file(key).bytes()
        return { body, contentType: contentTypeForKey(key), size: body.length }
      } catch (error) {
        if (isNotFound(error)) return null
        if (isForbidden(error)) {
          // A bucket without s3:ListBucket answers 403 for a missing object; wrong credentials
          // answer 403 for every object. Both read as "not found" to the browser, and the second
          // must not hide: report it every time.
          options.onForbidden?.(key, error)
          return null
        }
        throw error
      }
    },
    async delete(key) {
      // A missing key is not an error (S3 itself answers 204 for this); some S3-compatible
      // endpoints answer 404 instead, so swallow that too.
      try {
        await client.delete(key)
      } catch (error) {
        if (isNotFound(error)) return
        throw error
      }
    },
    async *list(prefix): AsyncGenerator<ListedObject> {
      let continuationToken: string | undefined
      do {
        const page = await client.list({ prefix, continuationToken })
        for (const object of page.contents ?? []) {
          // No key, or no date to judge its age by: never reported, so `storage.sweep` can never
          // delete it — the safe failure is to keep an object, not to guess it is old enough to go.
          if (!object.key || !object.lastModified) continue
          yield { key: object.key, lastModified: new Date(object.lastModified) }
        }
        continuationToken =
          page.isTruncated && page.nextContinuationToken ? page.nextContinuationToken : undefined
      } while (continuationToken)
    },
  }
}
