/*
 * The clip toggle's two glyphs, Lucide's play and pause shapes inlined: neither is in the
 * offline icon bundle, and a runtime fetch from the Iconify API for a button over the hero
 * would be a needless round trip. Decorative: the button carries the name.
 */

const svgProps = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

export const PlayIcon = () => (
  <svg {...svgProps} aria-hidden="true">
    <path d="M6 3l14 9-14 9V3z" fill="currentColor" stroke="none" />
  </svg>
)

export const PauseIcon = () => (
  <svg {...svgProps} aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
  </svg>
)
