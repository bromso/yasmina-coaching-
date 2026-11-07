import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { cvDownloadResponse, extendedCvFilename, safeCvFilename } from "./cv-download"

const pdf = (bytes: Uint8Array<ArrayBuffer> = new Uint8Array([1, 2, 3])) =>
  new File([bytes], "JOB-12-Ada Lovelace.pdf", { type: "application/pdf" })

describe("cvDownloadResponse", () => {
  test("a stored CV: an attachment with the required headers, never cached", async () => {
    let seen: unknown
    const res = await cvDownloadResponse(async (input) => {
      seen = input
      return pdf()
    }, "12")
    expect(seen).toEqual({ id: 12 })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"JOB-12-Ada_Lovelace.pdf\"; filename*=UTF-8''JOB-12-Ada%20Lovelace.pdf"
    )
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("content-security-policy")).toBe("sandbox")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  test("no session, a bad id, or a refused application: 404 with the same safe headers", async () => {
    const download = async () => pdf()
    const noSession = await cvDownloadResponse(null, "1")
    expect(noSession.status).toBe(404)
    expect(noSession.headers.get("cache-control")).toBe("no-store")
    expect(noSession.headers.get("content-security-policy")).toBe("sandbox")
    expect((await cvDownloadResponse(download, undefined)).status).toBe(404)
    expect((await cvDownloadResponse(download, "abc")).status).toBe(404)
    expect((await cvDownloadResponse(download, "-1")).status).toBe(404)
    expect((await cvDownloadResponse(download, "1.5")).status).toBe(404)

    const gone = async (): Promise<File> => {
      throw new ORPCError("NOT_FOUND", { message: "Not found", defined: true })
    }
    const res = await cvDownloadResponse(gone, "1")
    expect(res.status).toBe(404)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  test("the api unreachable: still 404, not 502", async () => {
    const down = async (): Promise<File> => {
      throw new TypeError("fetch failed")
    }
    expect((await cvDownloadResponse(down, "1")).status).toBe(404)
  })

  test("safeCvFilename keeps the header well-formed", () => {
    expect(safeCvFilename('a"b\r\n/c.pdf')).toBe("a_b___c.pdf")
    expect(safeCvFilename("")).toBe("cv.pdf")
  })

  test("extendedCvFilename percent-encodes a non-ASCII name for RFC 5987", () => {
    expect(extendedCvFilename("JOB-3-Åsa Öberg.pdf")).toBe("UTF-8''JOB-3-%C3%85sa%20%C3%96berg.pdf")
  })

  test("extendedCvFilename strips CR/LF/quotes/slashes/backslashes before encoding", () => {
    expect(extendedCvFilename('a"b\r\n/c\\d.pdf')).toBe("UTF-8''abcd.pdf")
  })

  test("a non-ASCII CV name: both filename and filename* on the header", async () => {
    const res = await cvDownloadResponse(
      async () => new File([new Uint8Array([1])], "JOB-3-Åsa Öberg.pdf"),
      "3"
    )
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"JOB-3-_sa__berg.pdf\"; filename*=UTF-8''JOB-3-%C3%85sa%20%C3%96berg.pdf"
    )
  })
})
