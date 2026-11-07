import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fakeS3 } from "./fake-s3"
import { localStorage } from "./local"
import { s3Storage } from "./s3"
import type { Storage } from "./storage"

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
  [
    "s3",
    () =>
      s3Storage({
        bucket: "test",
        region: "us-east-1",
        endpoint: `http://localhost:${fake.server.port}`,
        accessKeyId: "k",
        secretAccessKey: "s",
      }),
  ],
]
if (process.env.S3_TEST_ENDPOINT) {
  providers.push([
    "s3 (real)",
    () =>
      s3Storage({
        bucket: process.env.S3_TEST_BUCKET ?? "uploads",
        region: process.env.S3_TEST_REGION ?? "us-east-1",
        endpoint: process.env.S3_TEST_ENDPOINT,
        accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "devstorage",
        secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "devstorage-secret",
      }),
  ])
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

    test("list(prefix) yields exactly the keys under it, each with a lastModified", async () => {
      const storage = make()
      const a = "avatars/9/CCCCCCCCCCCCCCCCCCCCCC.png"
      const b = "avatars/9/DDDDDDDDDDDDDDDDDDDDDD.png"
      const outside = "logos/9/EEEEEEEEEEEEEEEEEEEEEE.png"
      await storage.put(a, new Uint8Array([1]), "image/png")
      await storage.put(b, new Uint8Array([2]), "image/png")
      await storage.put(outside, new Uint8Array([3]), "image/png")
      try {
        const found: { key: string; lastModified: Date }[] = []
        for await (const object of storage.list("avatars/9/")) found.push(object)
        expect(found.map((o) => o.key).sort()).toEqual([a, b])
        for (const object of found) expect(object.lastModified).toBeInstanceOf(Date)
      } finally {
        await storage.delete(a)
        await storage.delete(b)
        await storage.delete(outside)
      }
    })

    test("a CV under applications/ round-trips as application/pdf and is listed", async () => {
      const storage = make()
      const cv = "applications/FFFFFFFFFFFFFFFFFFFFFF.pdf"
      await storage.put(cv, new Uint8Array([0x25, 0x50]), "application/pdf")
      try {
        expect((await storage.get(cv))?.contentType).toBe("application/pdf")
        const found: string[] = []
        for await (const object of storage.list("applications/")) found.push(object.key)
        expect(found).toEqual([cv])
      } finally {
        await storage.delete(cv)
      }
    })

    test("list of a prefix with nothing under it yields nothing", async () => {
      const storage = make()
      const found: unknown[] = []
      for await (const object of storage.list("avatars/404/")) found.push(object)
      expect(found).toEqual([])
    })
  })
}

test("local storage refuses a key that escapes its directory", async () => {
  await expect(
    localStorage(dir).put("../evil.png", new Uint8Array([1]), "image/png")
  ).rejects.toThrow()
})

test("s3 storage.list pages through ListObjectsV2 (the fake answers one key per page)", async () => {
  const storage = s3Storage({
    bucket: "test",
    region: "us-east-1",
    endpoint: `http://localhost:${fake.server.port}`,
    accessKeyId: "k",
    secretAccessKey: "s",
  })
  const keys = [
    "avatars/10/CCCCCCCCCCCCCCCCCCCCCC.png",
    "avatars/10/DDDDDDDDDDDDDDDDDDDDDD.png",
    "avatars/10/EEEEEEEEEEEEEEEEEEEEEE.png",
  ]
  await Promise.all(keys.map((key) => storage.put(key, new Uint8Array([1]), "image/png")))
  try {
    const found: string[] = []
    for await (const object of storage.list("avatars/10/")) found.push(object.key)
    expect(found.sort()).toEqual([...keys].sort())
  } finally {
    await Promise.all(keys.map((key) => storage.delete(key)))
  }
})

const s3For = (opts?: { onForbidden?: (key: string, error: unknown) => void }) =>
  s3Storage({
    bucket: "test",
    region: "us-east-1",
    endpoint: `http://localhost:${fake.server.port}`,
    accessKeyId: "k",
    secretAccessKey: "s",
    ...opts,
  })

test("get on a missing key is null (NoSuchKey)", async () => {
  expect(await s3For().get("avatars/20/missing.png")).toBeNull()
})

test("get on a key the bucket forbids is null and reported", async () => {
  const key = "avatars/21/forbidden.png"
  fake.forbidden.add(key)
  const calls: Array<[string, unknown]> = []
  try {
    const storage = s3For({ onForbidden: (k, error) => calls.push([k, error]) })
    expect(await storage.get(key)).toBeNull()
    expect(calls.length).toBe(1)
    expect(calls[0]?.[0]).toBe(key)
  } finally {
    fake.forbidden.delete(key)
  }
})

test("get is one request", async () => {
  const storage = s3For()
  const key = "avatars/22/one-request.png"
  await storage.put(key, new Uint8Array([1]), "image/png")
  try {
    const before = fake.requests.length
    await storage.get(key)
    expect(fake.requests.length - before).toBe(1)
  } finally {
    await storage.delete(key)
  }
})

test("get keeps the content type from the key", async () => {
  const storage = s3For()
  const key = "avatars/1/x.png"
  // Stored with a mismatched header, to prove `get` reads the type from the key's extension
  // rather than whatever the bucket happens to have recorded.
  await storage.put(key, new Uint8Array([1]), "application/octet-stream")
  try {
    const got = await storage.get(key)
    expect(got?.contentType).toBe("image/png")
  } finally {
    await storage.delete(key)
  }
})
