/*
 * OKLCH → sRGB, the way browsers render a token (gamut-clipped), and WCAG contrast on top. The one
 * implementation behind the email hex constants, `packages/ui`'s contrast test and anything else
 * that needs a token's real colour.
 */

/** sRGB channels, gamma-encoded, each 0–1. */
export type Rgb = [number, number, number]

export function map3(rgb: Rgb, f: (v: number, i: 0 | 1 | 2) => number): Rgb {
  return [f(rgb[0], 0), f(rgb[1], 1), f(rgb[2], 2)]
}

/** OKLCH (lightness 0–1, chroma, hue in degrees) → sRGB, clipped to the gamut. */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear: Rgb = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
  return map3(linear, (v) => {
    const x = Math.min(1, Math.max(0, v))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  })
}

const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/

/** An opaque `oklch(L C H)` value (L as a number or a percentage) → sRGB. */
export function parseOklch(value: string): Rgb {
  const match = OKLCH.exec(value.trim())
  if (!match) throw new Error(`not an opaque oklch() colour: ${value}`)
  const [, l, percent, c, h] = match
  const lightness = percent ? Number(l) / 100 : Number(l)
  return oklchToRgb(lightness, Number(c), Number(h))
}

/** sRGB → `#rrggbb`. */
export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

/** WCAG 2 relative luminance. */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = map3(rgb, (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio of two colours, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** `fg` at `alpha` composited over `bg`, as `bg-primary/90` renders over its parent. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return map3(fg, (v, i) => v * alpha + bg[i] * (1 - alpha))
}
