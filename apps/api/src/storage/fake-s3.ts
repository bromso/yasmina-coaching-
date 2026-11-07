// Test support only: a path-style fake S3 server, shared by storage.test.ts and
// jobs/builtin/storage.test.ts (the sweep job needs one too, to run against the s3 provider).

/**
 * PUT/GET/HEAD/DELETE on /<bucket>/<key>, keeps Content-Type, ignores auth. `GET
 * /<bucket>/?list-type=2&prefix=…` answers ListObjectsV2 with the XML Bun's `S3Client.list`
 * parses — one key per page, regardless of what `max-keys` the client asked for, so every list
 * of more than one object exercises `s3.list`'s own `continuationToken` pagination loop, not
 * just a single-page response. `forbidden` is a set of keys (not full paths — the bucket name is
 * whatever the caller used) that answer 403 AccessDenied on GET/HEAD instead of the usual
 * 200/404, for exercising a bucket without `s3:ListBucket` or wrong credentials. `requests`
 * records every request's method and path, for asserting how many a call made.
 */
export function fakeS3() {
  const objects = new Map<string, { body: Uint8Array; type: string; lastModified: number }>()
  const forbidden = new Set<string>()
  const requests: { method: string; path: string }[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const path = decodeURIComponent(url.pathname)
      requests.push({ method: req.method, path })
      if ((req.method === "GET" || req.method === "HEAD") && !url.searchParams.has("list-type")) {
        for (const key of forbidden) {
          if (path.endsWith(`/${key}`)) {
            return new Response(
              "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>",
              { status: 403 }
            )
          }
        }
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? ""
        const token = url.searchParams.get("continuation-token")
        const full = path + prefix // `path` is the bucket root, "/<bucket>/".
        const all = [...objects.entries()]
          .filter(([key]) => key.startsWith(full))
          .map(([key, object]) => ({
            key: key.slice(path.length),
            lastModified: object.lastModified,
          }))
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        const startIndex = token ? all.findIndex((o) => o.key === token) + 1 : 0
        const page = all.slice(startIndex, startIndex + 1)
        const isTruncated = startIndex + 1 < all.length
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<IsTruncated>${isTruncated}</IsTruncated>
${isTruncated ? `<NextContinuationToken>${page[0]?.key}</NextContinuationToken>` : ""}
${page
  .map(
    (c) =>
      `<Contents><Key>${c.key}</Key><LastModified>${new Date(c.lastModified).toISOString()}</LastModified><ETag>"x"</ETag><Size>0</Size><StorageClass>STANDARD</StorageClass></Contents>`
  )
  .join("")}
</ListBucketResult>`
        return new Response(xml, { headers: { "content-type": "application/xml" } })
      }
      if (req.method === "PUT") {
        objects.set(path, {
          body: new Uint8Array(await req.arrayBuffer()),
          type: req.headers.get("content-type") ?? "application/octet-stream",
          lastModified: Date.now(),
        })
        return new Response(null, { status: 200, headers: { etag: '"x"' } })
      }
      const object = objects.get(path)
      if (req.method === "DELETE") {
        objects.delete(path)
        return new Response(null, { status: 204 })
      }
      if (!object) return new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 })
      const headers = {
        "content-type": object.type,
        "content-length": String(object.body.length),
        etag: '"x"',
      }
      return new Response(req.method === "HEAD" ? null : object.body, { headers })
    },
  })
  return { server, objects, forbidden, requests }
}
