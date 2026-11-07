import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from "@repo/api-contract"
import { CONTENT_TYPES } from "./storage"

export type ImageExt = "png" | "jpg" | "webp"
export type ProcessedImage = {
  bytes: Uint8Array
  ext: ImageExt
  contentType: string
  width: number
  height: number
}

type Parsed = { bytes: Uint8Array; width: number; height: number }

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end))

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
// Allowlisted like JPEG: everything a decoder needs to draw the image (APNG frames and HDR colour
// included) stays;
// every other chunk — text, eXIf, tIME, C2PA (caBX), vendor/private chunks — is dropped.
const PNG_KEEP = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "IDAT",
  "IEND",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "bKGD",
  "pHYs",
  "acTL",
  "fcTL",
  "fdAT",
  // PNG 3rd edition (W3C, 2025): colour space and HDR mastering/light levels — no personal data,
  // and an HDR or wide-gamut image renders with the wrong colours without them.
  "cICP",
  "mDCv",
  "cLLi",
])

function png(b: Uint8Array): Parsed | null {
  if (b.length < 8 || PNG_SIGNATURE.some((v, k) => b[k] !== v)) return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const parts = [b.subarray(0, 8)]
  let i = 8
  let width = 0
  let height = 0
  while (i + 12 <= b.length) {
    const length = view.getUint32(i)
    const type = ascii(b, i + 4, i + 8)
    const end = i + 12 + length
    if (end > b.length) return null
    if (type === "IHDR") {
      if (i !== 8 || length < 8) return null
      width = view.getUint32(i + 8)
      height = view.getUint32(i + 12)
    }
    if (i === 8 && type !== "IHDR") return null
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end))
    i = end
    if (type === "IEND") return width && height ? { bytes: concat(parts), width, height } : null
  }
  return null
}

// SOF0–SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but do not.
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc

// RSTn (D0–D7) and SOI (D8) are valid only as bare markers inside entropy-coded scan data; TEM
// (01), the reserved 02–BF range, the JPG extension marker (C8), and 00 (meaningful only as
// entropy zero-stuffing) never start a segment where one is expected — there is no length field
// to read. Refuse the whole file rather than guess at one that isn't there.
const isJpegRefuseMarker = (m: number) =>
  m === 0x00 || m === 0x01 || (m >= 0x02 && m <= 0xbf) || m === 0xc8 || (m >= 0xd0 && m <= 0xd8)

// Structural segments a decoder needs to render the image: the true SOF markers (isSof), DHT,
// DAC, DQT, DNL, DRI, DHP and EXP. Always kept, alongside SOS (handled separately below).
const JPEG_STRUCTURAL_KEEP = new Set([0xc4, 0xcc, 0xdb, 0xdc, 0xdd, 0xde, 0xdf])

const jpegAsciiBytes = (s: string) => [...s].map((c) => c.charCodeAt(0))
const JFIF_SIG = jpegAsciiBytes("JFIF\0")
const ICC_PROFILE_SIG = jpegAsciiBytes("ICC_PROFILE\0")
const ADOBE_SIG = jpegAsciiBytes("Adobe")

function hasJpegSignature(b: Uint8Array, start: number, end: number, sig: number[]): boolean {
  if (end - start < sig.length) return false
  for (let k = 0; k < sig.length; k++) {
    if (b[start + k] !== sig[k]) return false
  }
  return true
}

// JFIF's fixed fields after the length: identifier (5), version (2), units (1), X/Y density (4)
// and thumbnail width/height (2). Anything after them is an embedded RGB thumbnail.
const JFIF_CORE_BYTES = 14

/**
 * The APP0 JFIF header cut to its core: the same identifier, version, units and densities, the
 * thumbnail size set to 0 × 0 and the thumbnail pixels gone (length 16). A thumbnail is a second,
 * unstripped copy of the picture — possibly of what the photo was cropped from.
 */
function jfifCore(b: Uint8Array, i: number): Uint8Array {
  const out = new Uint8Array(2 + 2 + JFIF_CORE_BYTES)
  out.set([0xff, 0xe0, 0x00, 2 + JFIF_CORE_BYTES])
  out.set(b.subarray(i + 4, i + 4 + JFIF_CORE_BYTES - 2), 4) // thumbnail w/h stay 0
  return out
}

/**
 * JPEG metadata is allowlisted, not denylisted. SOS and every structural segment (SOF*, DHT,
 * DAC, DQT, DNL, DRI, DHP, EXP) are always kept; of the APPn markers, only the three forms a
 * plain photo actually needs for rendering are kept, matched by their payload's own signature —
 * APP0 JFIF (the file-format header, cut to its core so no thumbnail survives), APP2 ICC_PROFILE
 * (color management) and APP14 Adobe (CMYK/transform hints). Every other APPn (EXIF, XMP, MPF,
 * Photoshop/IPTC, APP0 JFXX — a thumbnail extension that can embed a JPEG with its own EXIF — any
 * vendor's custom data, and an APP0/APP2/APP14 that doesn't match its own signature) and COM is
 * dropped, whatever it claims to be. Returns the bytes to keep, or null to drop the segment.
 */
function keptJpegSegment(marker: number, b: Uint8Array, i: number, end: number): Uint8Array | null {
  if (marker === 0xda || isSof(marker) || JPEG_STRUCTURAL_KEEP.has(marker)) {
    return b.subarray(i, end)
  }
  if (marker === 0xe0) {
    const complete = end - (i + 4) >= JFIF_CORE_BYTES
    return complete && hasJpegSignature(b, i + 4, end, JFIF_SIG) ? jfifCore(b, i) : null
  }
  if (marker === 0xe2 && hasJpegSignature(b, i + 4, end, ICC_PROFILE_SIG)) {
    return b.subarray(i, end)
  }
  if (marker === 0xee && hasJpegSignature(b, i + 4, end, ADOBE_SIG)) return b.subarray(i, end)
  return null // every other APPn, COM, and anything else reaching here
}

/**
 * Reads one marker segment's length field, computing where it ends and what of it is kept (see
 * keptJpegSegment). Null when the marker has no length field where a segment is
 * expected (see isJpegRefuseMarker) or the stored length is malformed or runs past the buffer —
 * either way the whole parse fails; `i` must point at the segment's leading FF byte.
 */
function readJpegSegment(
  b: Uint8Array,
  i: number
): { end: number; kept: Uint8Array | null } | null {
  const marker = b[i + 1] ?? 0
  if (isJpegRefuseMarker(marker)) return null
  if (i + 4 > b.length) return null
  const length = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)
  const end = i + 2 + length
  if (length < 2 || end > b.length) return null
  return { end, kept: keptJpegSegment(marker, b, i, end) }
}

// Inside entropy-coded data, 00 and D0–D7 (RSTn) following FF are data, not a marker. FF
// following FF is a fill byte — pure padding before the eventual marker — consumed one at a
// time (T.81 B.1.1.2), so a run of any length resolves to whichever byte follows the *last* FF
// in the run: that is what decides data vs. a real marker, never the first FF's successor.
const isJpegEntropyData = (next: number) => next === 0x00 || (next >= 0xd0 && next <= 0xd7)

/**
 * Scans a JPEG scan's entropy-coded data, starting at a marker — always SOS the first time,
 * and also (recursively, in effect) whatever marker interrupts one scan's data before the next.
 * A real marker ends the data gathered so far; it is then read and either dropped or kept per
 * the same allowlist as every other segment (so a later SOS resumes scanning, and a later
 * APP1/APP13/COM/non-allowlisted-APPn is dropped), and scanning resumes after it. A marker with
 * no length field where one is expected (RSTn/SOI mid-scan, TEM, reserved — see
 * isJpegRefuseMarker) fails the whole parse, same as it would before the first SOS. The first
 * real EOI (FF D9) ends the scan for good — a second scan, a whole second JPEG (MPF) or a vendor
 * trailer (motion photo, Samsung SEFT) after it is discarded, never read. False (never found an
 * EOI, or a segment is malformed) fails the whole parse.
 */
function scanEntropy(b: Uint8Array, start: number, parts: Uint8Array[]): boolean {
  let p = start
  while (p < b.length) {
    let q = p
    while (q < b.length) {
      if (b[q] !== 0xff) {
        q += 1
        continue
      }
      const next = b[q + 1]
      if (next === undefined) {
        q = b.length
        break
      }
      if (next === 0xff) {
        q += 1 // fill: re-examine starting at this next FF
        continue
      }
      if (isJpegEntropyData(next)) {
        q += 2
        continue
      }
      break
    }
    if (q >= b.length) return false // ran off the end before a real marker: truncated
    if (q > p) parts.push(b.subarray(p, q))
    const marker = b[q + 1] ?? 0
    if (marker === 0xd9) {
      parts.push(b.subarray(q, q + 2))
      return true
    }
    const seg = readJpegSegment(b, q)
    if (!seg) return false
    if (seg.kept) parts.push(seg.kept)
    p = seg.end
  }
  return false
}

function jpeg(b: Uint8Array): Parsed | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  let width = 0
  let height = 0
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] ?? 0
    if (marker === 0xff) {
      i += 1 // fill byte
      continue
    }
    if (marker === 0xd9) return null // EOI before any scan
    if (marker === 0xda) {
      if (!scanEntropy(b, i, parts)) return null
      return width && height ? { bytes: concat(parts), width, height } : null
    }
    const seg = readJpegSegment(b, i)
    if (!seg) return null
    if (isSof(marker)) {
      const length = seg.end - i - 2
      if (length < 8) return null
      height = ((b[i + 5] ?? 0) << 8) | (b[i + 6] ?? 0)
      width = ((b[i + 7] ?? 0) << 8) | (b[i + 8] ?? 0)
    }
    if (seg.kept) parts.push(seg.kept)
    i = seg.end
  }
  return null
}

// Allowlisted like PNG and JPEG; the VP8X flags for EXIF and XMP are cleared below because those
// chunks never survive (ICC, alpha and animation chunks are kept, so their flags stay true).
const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"])

function webp(b: Uint8Array): Parsed | null {
  if (b.length < 20 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return null
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const riffEnd = 8 + view.getUint32(4, true)
  if (riffEnd > b.length) return null
  const parts: Uint8Array[] = []
  let i = 12
  let width = 0
  let height = 0
  let sawImage = false
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, i + 4)
    const size = view.getUint32(i + 4, true)
    const dataEnd = i + 8 + size
    if (dataEnd > riffEnd) return null
    const end = Math.min(dataEnd + (size & 1), riffEnd)
    const d = b.subarray(i + 8, dataEnd)
    if (type === "VP8X") {
      if (size < 10) return null
      width = 1 + ((d[4] ?? 0) | ((d[5] ?? 0) << 8) | ((d[6] ?? 0) << 16))
      height = 1 + ((d[7] ?? 0) | ((d[8] ?? 0) << 8) | ((d[9] ?? 0) << 16))
      const chunk = Uint8Array.from(b.subarray(i, end))
      chunk[8] = (chunk[8] ?? 0) & ~0x0c // the EXIF and XMP flags: those chunks are dropped below
      parts.push(chunk)
    } else if (type === "VP8 " || type === "VP8L" || type === "ANMF") {
      sawImage = true
      if (!width && type === "VP8 ") {
        if (size < 10) return null
        width = ((d[6] ?? 0) | ((d[7] ?? 0) << 8)) & 0x3fff
        height = ((d[8] ?? 0) | ((d[9] ?? 0) << 8)) & 0x3fff
      } else if (!width && type === "VP8L") {
        if (size < 5 || d[0] !== 0x2f) return null
        const bits =
          ((d[1] ?? 0) | ((d[2] ?? 0) << 8) | ((d[3] ?? 0) << 16) | ((d[4] ?? 0) << 24)) >>> 0
        width = (bits & 0x3fff) + 1
        height = ((bits >>> 14) & 0x3fff) + 1
      }
      parts.push(b.subarray(i, end))
    } else if (WEBP_KEEP.has(type)) {
      parts.push(b.subarray(i, end))
    }
    i = end
  }
  if (!sawImage || !width || !height) return null
  const body = concat(parts)
  const header = new Uint8Array(12)
  header.set([0x52, 0x49, 0x46, 0x46]) // RIFF
  new DataView(header.buffer).setUint32(4, 4 + body.length, true)
  header.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  return { bytes: concat([header, body]), width, height }
}

const PARSERS: [ImageExt, (b: Uint8Array) => Parsed | null][] = [
  ["png", png],
  ["jpg", jpeg],
  ["webp", webp],
]

/**
 * A PNG, JPEG or WebP, by its bytes alone, with metadata (EXIF/GPS, XMP, text chunks) removed.
 * Null for anything else, anything malformed or truncated, over MAX_IMAGE_BYTES, or with a side
 * of 0 or over MAX_IMAGE_DIMENSION. Never throws.
 */
export function processImage(input: Uint8Array): ProcessedImage | null {
  if (input.length === 0 || input.length > MAX_IMAGE_BYTES) return null
  for (const [ext, parse] of PARSERS) {
    let parsed: Parsed | null = null
    try {
      parsed = parse(input)
    } catch {
      return null
    }
    if (!parsed) continue
    const { width, height } = parsed
    if (width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION)
      return null
    return { ...parsed, ext, contentType: CONTENT_TYPES[ext] }
  }
  return null
}
