import { describe, expect, test } from "bun:test"
import { MAX_IMAGE_BYTES } from "@repo/api-contract"
import {
  ascii,
  bytes,
  concatAll,
  has,
  jpeg,
  jpegDqt,
  jpegSeg,
  jpegSof0,
  jpegSos,
  PNG_1X1,
  png,
  pngChunk,
  riffChunk,
  u32be,
  vp8l,
  vp8x,
  webp,
} from "./fixtures"
import { processImage } from "./image"

describe("processImage", () => {
  test("accepts the real 1×1 PNG", () => {
    expect(processImage(PNG_1X1)).toMatchObject({
      ext: "png",
      contentType: "image/png",
      width: 1,
      height: 1,
    })
  })
  test("PNG: drops tEXt/iTXt/zTXt/eXIf, keeps the rest", () => {
    const out = processImage(
      png(4, 3, [pngChunk("tEXt", ascii("GPS\0here")), pngChunk("eXIf", [1, 2])])
    )
    expect(out?.width).toBe(4)
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "tEXt")).toBe(false)
    expect(has(out.bytes, "eXIf")).toBe(false)
    expect(has(out.bytes, "IDAT")).toBe(true)
  })
  test("a PNG keeps only the allowlisted chunks", () => {
    const out = processImage(
      png(4, 3, [
        pngChunk("caBX", ascii("C2PA")),
        pngChunk("prVt", ascii("private")),
        pngChunk("tIME", [2026, 1, 1, 0, 0, 0]),
      ])
    )
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "caBX")).toBe(false)
    expect(has(out.bytes, "prVt")).toBe(false)
    expect(has(out.bytes, "tIME")).toBe(false)
    expect(has(out.bytes, "IHDR")).toBe(true)
    expect(has(out.bytes, "IDAT")).toBe(true)
    expect(has(out.bytes, "IEND")).toBe(true)
  })
  test("a PNG keeps the 3rd-edition colour chunks (cICP, mDCv, cLLi)", () => {
    const out = processImage(
      png(4, 3, [
        pngChunk("cICP", [9, 16, 0, 1]),
        pngChunk("mDCv", new Array(24).fill(0)),
        pngChunk("cLLi", new Array(8).fill(0)),
      ])
    )
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "cICP")).toBe(true)
    expect(has(out.bytes, "mDCv")).toBe(true)
    expect(has(out.bytes, "cLLi")).toBe(true)
  })
  test("a PNG whose first chunk is not IHDR is refused", () => {
    const raw = bytes(
      [137, 80, 78, 71, 13, 10, 26, 10],
      pngChunk("IDAT", [1, 2, 3]),
      pngChunk("IHDR", [...u32be(4), ...u32be(3), 8, 6, 0, 0, 0]),
      pngChunk("IEND", [])
    )
    expect(processImage(raw)).toBeNull()
  })
  test("a PNG with two IHDR chunks is refused", () => {
    const out = processImage(
      png(4, 3, [pngChunk("IHDR", [...u32be(4), ...u32be(3), 8, 6, 0, 0, 0])])
    )
    expect(out).toBeNull()
  })
  test("JPEG: reads the SOF size and drops APP1 (EXIF) and APP13", () => {
    const out = processImage(
      jpeg(640, 480, [jpegSeg(0xe1, ascii("Exif\0\0GPSDATA")), jpegSeg(0xed, ascii("Photoshop"))])
    )
    expect(out).toMatchObject({ ext: "jpg", contentType: "image/jpeg", width: 640, height: 480 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "GPSDATA")).toBe(false)
    expect(has(out.bytes, "Photoshop")).toBe(false)
    expect([...out.bytes.slice(-2)]).toEqual([0xff, 0xd9])
  })
  test("WebP: drops EXIF/XMP chunks, clears their VP8X flags, fixes the RIFF size", () => {
    const out = processImage(
      webp([
        vp8x(10, 20, 0x0c),
        vp8l(10, 20),
        riffChunk("EXIF", ascii("GPSDATA")),
        riffChunk("XMP ", ascii("xmp")),
      ])
    )
    expect(out).toMatchObject({
      ext: "webp",
      contentType: "image/webp",
      width: 10,
      height: 20,
    })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "GPSDATA")).toBe(false)
    expect((out.bytes[20] ?? 0) & 0x0c).toBe(0)
    const view = new DataView(out.bytes.buffer, out.bytes.byteOffset)
    expect(view.getUint32(4, true)).toBe(out.bytes.length - 8)
  })
  test("a WebP drops an unknown chunk and keeps ICCP", () => {
    const out = processImage(
      webp([
        vp8x(10, 20, 0x20),
        riffChunk("ICCP", ascii("ICCDATA")),
        riffChunk("ABCD", [1, 2, 3]),
        vp8l(10, 20),
      ])
    )
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "ICCP")).toBe(true)
    expect(has(out.bytes, "ABCD")).toBe(false)
    expect((out.bytes[20] ?? 0) & 0x20).toBe(0x20)
  })
  test("JPEG: a secondary JPEG (MPF) with its own EXIF after the primary's EOI is discarded", () => {
    const primary = jpeg(10, 10)
    const secondary = concatAll([0xff, 0xd8], jpegSeg(0xe1, ascii("GPS2")), [0xff, 0xd9])
    const out = processImage(concatAll(primary, secondary))
    expect(out).toMatchObject({ ext: "jpg", contentType: "image/jpeg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "GPS2")).toBe(false)
    expect(out.bytes.length).toBe(primary.length)
    expect([...out.bytes.slice(-2)]).toEqual([0xff, 0xd9])
  })
  test("JPEG: APP1 spliced between two progressive scans is dropped, both scans kept intact", () => {
    const sos = jpegSos()
    const raw = bytes(
      [0xff, 0xd8],
      jpegDqt(),
      jpegSof0(10, 10),
      sos,
      [0x11, 0x22],
      sos,
      jpegSeg(0xe1, ascii("GPS3")),
      [0x33, 0x44],
      [0xff, 0xd9]
    )
    const expected = bytes(
      [0xff, 0xd8],
      jpegDqt(),
      jpegSof0(10, 10),
      sos,
      [0x11, 0x22],
      sos,
      [0x33, 0x44],
      [0xff, 0xd9]
    )
    const out = processImage(raw)
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "GPS3")).toBe(false)
    expect([...out.bytes]).toEqual([...expected])
  })
  test("JPEG: a vendor trailer (Samsung SEFT, motion-photo MP4) after EOI is accepted and dropped", () => {
    const primary = jpeg(10, 10)
    const withTrailer = concatAll(primary, ascii("SEFT, then whatever garbage follows it"))
    const out = processImage(withTrailer)
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "SEFT")).toBe(false)
    expect(out.bytes.length).toBe(primary.length)
  })
  test("JPEG: drops a COM segment", () => {
    const out = processImage(jpeg(10, 10, [jpegSeg(0xfe, ascii("COMMENT"))]))
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "COMMENT")).toBe(false)
  })
  test("JPEG: drops any APP2 that isn't ICC_PROFILE (MPF directory or anything else)", () => {
    const out = processImage(
      jpeg(10, 10, [
        jpegSeg(0xe2, [...ascii("MPF\0"), 1, 2, 3]),
        jpegSeg(0xe2, ascii("ICC_PROFILE_MARKER")), // close to the real signature, but not it
      ])
    )
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "MPF")).toBe(false)
    expect(has(out.bytes, "ICC_PROFILE_MARKER")).toBe(false)
  })
  test("JPEG: keeps APP0 JFIF, APP2 ICC_PROFILE and APP14 Adobe", () => {
    const out = processImage(
      jpeg(10, 10, [
        jpegSeg(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
        jpegSeg(0xe2, [...ascii("ICC_PROFILE\0"), 1, 1, 0xde, 0xad]),
        jpegSeg(0xee, [...ascii("Adobe"), 100, 0, 0, 0, 1]),
      ])
    )
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "JFIF")).toBe(true)
    expect(has(out.bytes, "ICC_PROFILE")).toBe(true)
    expect(has(out.bytes, "Adobe")).toBe(true)
  })
  test("JPEG: drops APP0 JFXX (a thumbnail extension that can carry its own EXIF)", () => {
    const jfxx = jpegSeg(0xe0, [...ascii("JFXX\0"), 0x10, 0xff, 0xd8, ...ascii("THUMBGPS")])
    const out = processImage(jpeg(10, 10, [jfxx]))
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "JFXX")).toBe(false)
    expect(has(out.bytes, "THUMBGPS")).toBe(false)
    expect(out.bytes.length).toBe(jpeg(10, 10).length)
  })
  test("JPEG: APP0 JFIF keeps its header but loses the embedded thumbnail (length 16)", () => {
    // 2×1 RGB thumbnail: the pixels are a second, unstripped copy of the picture.
    const header = [...ascii("JFIF\0"), 1, 2, 1, 0, 72, 0, 72]
    const out = processImage(jpeg(10, 10, [jpegSeg(0xe0, [...header, 2, 1, ...ascii("RGBRGB")])]))
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "RGBRGB")).toBe(false)
    // FF E0, length 16, the same identifier/version/units/densities, thumbnail 0 × 0.
    expect([...out.bytes.slice(2, 20)]).toEqual([0xff, 0xe0, 0x00, 0x10, ...header, 0, 0])
    expect([...out.bytes.slice(20)]).toEqual([...jpeg(10, 10).slice(2)])
  })
  test("JPEG: a JFIF too short for its fixed fields is dropped", () => {
    const out = processImage(jpeg(10, 10, [jpegSeg(0xe0, [...ascii("JFIF\0"), 1, 2])]))
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "JFIF")).toBe(false)
  })
  // Where a segment must start, these have no length field: reading one anyway would let the
  // next two bytes skip over (and so keep) an APP1.
  for (const marker of [0x01, 0xd8, 0xd3, 0x00, 0x50, 0x5f]) {
    const hex = marker.toString(16).padStart(2, "0").toUpperCase()
    test(`JPEG: a length-less or reserved marker FF ${hex} before the scan is refused`, () => {
      const hidden = [0xff, marker, 0x00, 0x14, ...jpegSeg(0xe1, ascii("Exif\0\0GPS"))]
      expect(processImage(jpeg(10, 10, [hidden]))).toBeNull()
    })
  }
  for (const marker of [0x01, 0x50, 0xbf]) {
    const hex = marker.toString(16).padStart(2, "0").toUpperCase()
    test(`JPEG: TEM/reserved FF ${hex} inside the scan data is refused`, () => {
      const raw = bytes(
        [0xff, 0xd8],
        jpegDqt(),
        jpegSof0(10, 10),
        jpegSos(),
        [0x11, 0x22, 0xff, marker, 0x00, 0x04, 0x33, 0x44],
        [0xff, 0xd9]
      )
      expect(processImage(raw)).toBeNull()
    })
  }
  test("JPEG: drops APP3 and APP12 (every APPn outside the allowlist)", () => {
    const out = processImage(
      jpeg(10, 10, [jpegSeg(0xe3, ascii("META")), jpegSeg(0xec, ascii("Ducky"))])
    )
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "META")).toBe(false)
    expect(has(out.bytes, "Ducky")).toBe(false)
  })
  test("JPEG: a fill byte (FF FF) before APP1 no longer hides it — EXIF still dropped", () => {
    const sos = jpegSos()
    const raw = bytes(
      [0xff, 0xd8],
      jpegDqt(),
      jpegSof0(10, 10),
      sos,
      [0x11, 0x22],
      [0xff, 0xff], // fill byte, then the real APP1 marker
      jpegSeg(0xe1, ascii("Exif\0\0GPSLEAK")),
      [0x33, 0x44],
      [0xff, 0xd9]
    )
    const out = processImage(raw)
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "GPSLEAK")).toBe(false)
  })
  test("JPEG: a fill byte before EOI still ends the scan — a trailing secondary JPEG is discarded", () => {
    const sos = jpegSos()
    const primary = bytes(
      [0xff, 0xd8],
      jpegDqt(),
      jpegSof0(10, 10),
      sos,
      [0x11, 0x22],
      [0xff, 0xff, 0xd9] // fill byte then EOI
    )
    const secondary = concatAll([0xff, 0xd8], jpegSeg(0xe1, ascii("GPSLEAK2")), [0xff, 0xd9])
    const out = processImage(concatAll(primary, secondary))
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect(has(out.bytes, "GPSLEAK2")).toBe(false)
    expect([...out.bytes]).toEqual([...primary])
  })
  test("JPEG: a fill byte then EOI at the very end of the data is accepted, bytes preserved", () => {
    const sos = jpegSos()
    const raw = bytes(
      [0xff, 0xd8],
      jpegDqt(),
      jpegSof0(10, 10),
      sos,
      [0x11, 0x22],
      [0xff, 0xff, 0xd9]
    )
    const out = processImage(raw)
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    expect([...out.bytes]).toEqual([...raw])
  })
  test("JPEG: a stray SOI marker inside a scan is refused", () => {
    const sos = jpegSos()
    const raw = bytes(
      [0xff, 0xd8],
      jpegDqt(),
      jpegSof0(10, 10),
      sos,
      [0x11, 0x22],
      [0xff, 0xd8], // stray SOI — never valid mid-scan
      [0x33, 0x44, 0xff, 0xd9]
    )
    expect(processImage(raw)).toBeNull()
  })
  test("JPEG: FF00 (stuffed) and FFD0 (RSTn) inside entropy data survive untouched", () => {
    const sos = jpegSos()
    const data = [0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33]
    const raw = bytes([0xff, 0xd8], jpegDqt(), jpegSof0(10, 10), sos, data, [0xff, 0xd9])
    const out = processImage(raw)
    expect(out).toMatchObject({ ext: "jpg", width: 10, height: 10 })
    if (!out) throw new Error("expected a processed image")
    const tail = out.bytes.slice(out.bytes.length - data.length - 2)
    expect([...tail]).toEqual([...data, 0xff, 0xd9])
  })
  test("JPEG: refuses a scan with no EOI anywhere", () => {
    const sos = jpegSos()
    const raw = bytes([0xff, 0xd8], jpegDqt(), jpegSof0(10, 10), sos, [0x11, 0x22, 0x33])
    expect(processImage(raw)).toBeNull()
  })
  test("refuses SVG, GIF, HTML renamed to .png, and empty input", () => {
    expect(
      processImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))
    ).toBeNull()
    expect(processImage(bytes(ascii("GIF89a"), [1, 0, 1, 0, 0, 0, 0]))).toBeNull()
    expect(processImage(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull()
    expect(processImage(new Uint8Array())).toBeNull()
  })
  test("refuses dimensions over 4096 and zero", () => {
    expect(processImage(png(4097, 10))).toBeNull()
    expect(processImage(jpeg(10, 5000))).toBeNull()
    expect(processImage(png(0, 10))).toBeNull()
  })
  test("refuses truncated files (Review Focus 2)", () => {
    const whole = jpeg(10, 10)
    expect(processImage(whole.subarray(0, 12))).toBeNull()
    expect(processImage(png(4, 4).subarray(0, 30))).toBeNull()
    const lying = png(4, 4)
    lying.set(u32be(0x7fffffff), 33) // IDAT length far past the end
    expect(processImage(lying)).toBeNull()
  })
  test("refuses anything over MAX_IMAGE_BYTES before parsing", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1)
    big.set(PNG_1X1)
    expect(processImage(big)).toBeNull()
  })
})
