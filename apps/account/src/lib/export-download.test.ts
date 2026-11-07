import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { exportDownloadResponse, safeFilename } from "./export-download"

const json = new File(['{"user":{}}'], "brand-export-2026-10-10.json", {
  type: "application/json",
})

describe("exportDownloadResponse", () => {
  test("a ready export: an attachment named as the api named it, never cached", async () => {
    let seen: unknown
    const res = await exportDownloadResponse(async (input) => {
      seen = input
      return json
    }, "12")
    expect(seen).toEqual({ id: 12 })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="brand-export-2026-10-10.json"'
    )
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("content-type")).toStartWith("application/json")
    expect(await res.text()).toBe('{"user":{}}')
  })

  test("signed out, a bad id, or an export that is not available: 404", async () => {
    const download = async () => json
    expect((await exportDownloadResponse(null, "1")).status).toBe(404)
    expect((await exportDownloadResponse(download, null)).status).toBe(404)
    expect((await exportDownloadResponse(download, "abc")).status).toBe(404)
    const gone = async (): Promise<File> => {
      throw new ORPCError("NOT_FOUND", { message: "That export is not available.", defined: true })
    }
    const res = await exportDownloadResponse(gone, "1")
    expect(res.status).toBe(404)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  test("the api unreachable: 502", async () => {
    const down = async (): Promise<File> => {
      throw new TypeError("fetch failed")
    }
    expect((await exportDownloadResponse(down, "1")).status).toBe(502)
  })

  test("safeFilename keeps the header well-formed", () => {
    expect(safeFilename('a"b\r\n/c.json')).toBe("a_b___c.json")
    expect(safeFilename("")).toBe("export.json")
  })
})
