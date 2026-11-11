import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { contrast, type Rgb } from "@repo/tokens/color"
import { PAIRS } from "./templates/layout"
import { EMAIL_COLORS, EMAIL_FONTS } from "./tokens.generated"

const SRC = import.meta.dir

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__fixtures__" ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes("generated") ? [path] : []
  })
}

const rgb = (hex: string): Rgb =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb

describe("mail look", () => {
  test("no colour or font literal outside the generated tokens", () => {
    for (const file of sources(SRC).filter(
      (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx")
    )) {
      const text = readFileSync(file, "utf8")
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, file).not.toMatch(/\brgba?\(|\bhsla?\(|oklch\(/)
      expect(text, file).not.toMatch(/sans-serif|Georgia/)
      expect(text, file).not.toMatch(
        /["'`]\s*(white|black|gray|grey|red|blue|green|orange|purple|silver|transparent)\s*["'`]|:\s*(white|black|gray|grey|red|blue|green|orange|purple|silver|transparent)\s*[;"'`]/
      )
      if (!file.endsWith("layout.tsx")) {
        expect(text, file).not.toMatch(/\b(color|background(Color)?)\s*:\s*["'`]/)
      }
    }
  })

  test("every text and background pair a template uses clears 4.5:1", () => {
    expect(PAIRS.length).toBeGreaterThan(0)
    for (const { name, fg, bg } of PAIRS) {
      expect(contrast(rgb(fg), rgb(bg)), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  test("a mail carries the palette and the display font, and no old grey", async () => {
    const { emails } = await import("./index")
    const mail = await emails.verifyEmail({ name: "Ada", link: "https://example.com/x" })
    expect(mail.html).toContain(EMAIL_COLORS.background)
    expect(mail.html).toContain(EMAIL_COLORS.primary)
    expect(mail.html).toContain(EMAIL_FONTS.display.replaceAll('"', "&quot;").slice(0, 7))
    expect(mail.html).not.toContain("#f6f6f6")
    expect(mail.html).toContain("font-family:Georgia")
    expect(mail.html).not.toContain("#111827")
  })

  test("no rendered mail has React Email's default blue; every link carries brandBlue inline", async () => {
    const { emails } = await import("./index")
    const mails = await Promise.all([
      emails.verifyEmail({ name: "Ada", link: "https://example.com/x" }),
      emails.invitation({
        inviterName: "Bo",
        workspaceName: "W",
        link: "https://example.com/i",
        expiresInDays: 7,
      } as never),
    ])
    for (const mail of mails) {
      expect(mail.html).not.toContain(`#${"067df7"}`)
      const anchors = mail.html.match(/<a [^>]*>/g) ?? []
      expect(anchors.length).toBeGreaterThan(0)
      for (const a of anchors) {
        if (a.includes("line-height:100%")) continue // the button, drawn with primary colours
        expect(a).toContain(`color:${EMAIL_COLORS.brandBlue}`)
      }
    }
  })
})
