import { describe, expect, test } from "bun:test"
import { MAX_CV_BYTES } from "@repo/api-contract"
import { TINY_PDF } from "./fixtures"
import { CvRejected, PDF_EOF_WINDOW, validatePdf } from "./pdf"

const enc = (s: string) => new TextEncoder().encode(s)

const rejected = (bytes: Uint8Array) => {
  try {
    validatePdf(bytes)
    return null
  } catch (error) {
    return error
  }
}

describe("validatePdf", () => {
  test("a tiny well-formed PDF is accepted", () => {
    expect(rejected(TINY_PDF)).toBeNull()
  })

  test("HTML, a zip and an executable are refused, whatever they were declared as", () => {
    for (const body of [
      enc("<!doctype html><script>alert(1)</script>%%EOF"),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...enc("%%EOF")]),
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00, ...enc("%%EOF")]),
      enc(" %PDF-1.4\n%%EOF"),
      new Uint8Array(),
    ]) {
      expect(rejected(body)).toBeInstanceOf(CvRejected)
    }
  })

  test("a header without %%EOF in the last 1024 bytes is refused", () => {
    expect(rejected(enc("%PDF-1.4\nno trailer"))).toBeInstanceOf(CvRejected)
    const padded = (pad: number) => {
      const tail = new Uint8Array(pad)
      return new Uint8Array([...enc("%PDF-1.4\n%%EOF"), ...tail])
    }
    expect(rejected(padded(PDF_EOF_WINDOW - 5))).toBeNull()
    expect(rejected(padded(PDF_EOF_WINDOW))).toBeInstanceOf(CvRejected)
  })

  test("over 5 MB is refused before the content is looked at", () => {
    const big = new Uint8Array(MAX_CV_BYTES + 1)
    big.set(TINY_PDF)
    big.set(enc("%%EOF"), big.length - 6)
    expect((rejected(big) as Error).message).toContain("too large")
    const max = new Uint8Array(MAX_CV_BYTES)
    max.set(TINY_PDF)
    max.set(enc("%%EOF"), max.length - 6)
    expect(rejected(max)).toBeNull()
  })
})
