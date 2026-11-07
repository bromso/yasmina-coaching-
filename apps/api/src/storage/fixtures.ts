// Byte-level builders for PNG/JPEG/WebP fixtures, shared by image.test.ts and files.test.ts, and
// the tiny PDF pdf.test.ts and jobs-apply.test.ts upload.

export const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
export const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
export const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
export const bytes = (...parts: number[][]) => new Uint8Array(parts.flat())
export const has = (haystack: Uint8Array, needle: string) =>
  Buffer.from(haystack).includes(Buffer.from(needle, "latin1"))

// The real 1×1 PNG (also used by the e2e test).
export const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
)

export const pngChunk = (type: string, data: number[]) => [
  ...u32be(data.length),
  ...ascii(type),
  ...data,
  0,
  0,
  0,
  0,
]
export const png = (w: number, h: number, extra: number[][] = []) =>
  bytes(
    [137, 80, 78, 71, 13, 10, 26, 10],
    pngChunk("IHDR", [...u32be(w), ...u32be(h), 8, 6, 0, 0, 0]),
    ...extra,
    pngChunk("IDAT", [1, 2, 3]),
    pngChunk("IEND", [])
  )

export const jpegSeg = (marker: number, data: number[]) => [
  0xff,
  marker,
  ...u32be(data.length + 2).slice(2),
  ...data,
]
export const jpegDqt = () => jpegSeg(0xdb, new Array(65).fill(1))
export const jpegSof0 = (w: number, h: number) =>
  jpegSeg(0xc0, [8, ...u32be(h).slice(2), ...u32be(w).slice(2), 1, 1, 0x11, 0])
export const jpegSos = () => jpegSeg(0xda, [1, 1, 0, 0, 0x3f, 0])
export const jpeg = (w: number, h: number, extra: number[][] = []) =>
  bytes([0xff, 0xd8], ...extra, jpegDqt(), jpegSof0(w, h), jpegSos(), [0x12, 0x34, 0xff, 0xd9])
// Concatenates Uint8Arrays and plain byte arrays — for gluing a synthetic JPEG onto a trailer
// (a second JPEG, a vendor blob) the way phone cameras actually do.
export const concatAll = (...parts: (Uint8Array | number[])[]) =>
  Uint8Array.from(parts.flatMap((p) => Array.from(p)))

/** A minimal 10×10 JPEG carrying an APP1 (EXIF) segment with a GPS tag, for stripping tests. */
export const jpegWithExif = (width = 10, height = 10): Uint8Array =>
  jpeg(width, height, [jpegSeg(0xe1, ascii("Exif\0\0GPSDATA"))])

export const riffChunk = (type: string, data: number[]) => [
  ...ascii(type),
  ...u32le(data.length),
  ...data,
  ...(data.length % 2 ? [0] : []),
]
export const webp = (chunks: number[][]) => {
  const body = chunks.flat()
  return bytes(ascii("RIFF"), u32le(4 + body.length), ascii("WEBP"), body)
}
export const vp8x = (w: number, h: number, flags: number) =>
  riffChunk("VP8X", [flags, 0, 0, 0, ...u32le(w - 1).slice(0, 3), ...u32le(h - 1).slice(0, 3)])
export const vp8l = (w: number, h: number) => {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)
  return riffChunk("VP8L", [0x2f, ...u32le(bits), 0])
}

/** The smallest file `validatePdf` accepts: a header, a body and the trailer. */
export const TINY_PDF = new TextEncoder().encode(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
)
