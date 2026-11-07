import { BRAND_NAME } from "@repo/sites/brand"
import { ImageResponse } from "next/og"

export const OG_SIZE = { width: 1200, height: 630 } as const

/** The element the OG image is rendered from; kept separate so it is testable without next/og's renderer. */
export function ogElement({
  title,
  subtitle,
  brand = BRAND_NAME,
}: {
  title: string
  subtitle?: string
  brand?: string
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#0a0a0a",
        color: "#fafafa",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 10, height: 36, background: "#fafafa", borderRadius: 2 }} />
          <div
            style={{ width: 10, height: 36, background: "#fafafa", borderRadius: 2, opacity: 0.7 }}
          />
          <div
            style={{ width: 10, height: 36, background: "#fafafa", borderRadius: 2, opacity: 0.4 }}
          />
        </div>
        {brand}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 32, opacity: 0.75 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

export function ogImage(props: Parameters<typeof ogElement>[0]) {
  return new ImageResponse(ogElement(props), OG_SIZE)
}
