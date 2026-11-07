import { describe, expect, test } from "bun:test"
import { TINY_PDF, tinyPdfFile } from "./pdf"

describe("TINY_PDF / tinyPdfFile", () => {
  test("has a PDF header and an %%EOF trailer", () => {
    const text = new TextDecoder().decode(TINY_PDF)
    expect(text.startsWith("%PDF-1.4")).toBe(true)
    expect(text).toContain("%%EOF")
  })

  test("tinyPdfFile wraps it as a named application/pdf File", async () => {
    const file = tinyPdfFile()
    expect(file.name).toBe("cv.pdf")
    expect(file.type).toBe("application/pdf")
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(TINY_PDF)
  })

  test("tinyPdfFile accepts a custom name", () => {
    expect(tinyPdfFile("resume.pdf").name).toBe("resume.pdf")
  })
})
