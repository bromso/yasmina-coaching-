import { BRAND_NAME } from "@repo/sites"
import { legalPath } from "@repo/sites/legal"
import { SiteFooter, SiteFooterLegal } from "@repo/ui/blocks/site-footer"
import { Brand } from "@repo/ui/components/brand"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

/** The legal app's production origin; the paths come from `legalPath`, as an app's `legalUrl` does. */
const LEGAL = "https://legal.brand.com"

/** Shaped like `footerGroups()` from `@repo/sites`, with literal hrefs. */
const groups = [
  {
    title: "Product",
    links: [
      { label: "App", href: "https://app.brand.com" },
      { label: "Docs", href: "https://docs.brand.com" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Jobs", href: "https://jobs.brand.com" },
      { label: "Help", href: "https://help.brand.com" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "https://auth.brand.com" },
      { label: "Account", href: "https://account.brand.com" },
    ],
  },
]

const meta = {
  title: "Blocks/SiteFooter",
  component: SiteFooter,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    brand: <Brand href="https://www.brand.com" />,
    groups,
    legal: (
      <SiteFooterLegal
        year={2026}
        links={[
          { label: "Privacy", href: `${LEGAL}${legalPath("privacy", "en")}` },
          { label: "Terms", href: `${LEGAL}${legalPath("terms", "en")}` },
          { label: "Accessibility", href: `${LEGAL}${legalPath("accessibility", "en")}` },
          { label: "Contact", href: "https://www.brand.com/kontakt" },
        ]}
      />
    ),
  },
} satisfies Meta<typeof SiteFooter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("contentinfo")).toBeInTheDocument()
    const nav = canvas.getByRole("navigation", { name: "Footer" })
    await expect(within(nav).getAllByRole("heading", { level: 2 })).toHaveLength(3)
    await expect(within(nav).getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://docs.brand.com"
    )
    const legal = canvas.getByText(/^© 2026/)
    await expect(legal).toBeVisible()
    await expect(legal).toHaveTextContent(
      `© 2026 ${BRAND_NAME} · Privacy · Terms · Accessibility · Contact`
    )
    await expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      `${LEGAL}${legalPath("privacy", "en")}`
    )
  },
}

/**
 * WCAG 1.4.10 at 320 CSS px (`mobile1`): the brand, the link groups and the legal line stack and
 * wrap inside the screen; nothing scrolls sideways and every link stays in the page.
 */
export const Narrow: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const doc = canvasElement.ownerDocument.documentElement
    await expect(doc.clientWidth).toBeLessThanOrEqual(320)
    await expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth)
    await expect(canvas.getAllByRole("contentinfo")).toHaveLength(1)
    const links = within(canvas.getByRole("contentinfo")).getAllByRole("link")
    // The brand, six group links and four legal links.
    await expect(links).toHaveLength(11)
    for (const link of links) {
      await expect(link).toBeVisible()
      const rect = link.getBoundingClientRect()
      await expect(rect.left).toBeGreaterThanOrEqual(0)
      await expect(rect.right).toBeLessThanOrEqual(doc.clientWidth)
    }
    // The legal row sits below the link groups.
    const nav = canvas.getByRole("navigation", { name: "Footer" })
    const legal = canvas.getByText(/^© 2026/)
    await expect(legal.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      nav.getBoundingClientRect().bottom
    )
  },
}

export const WithoutLegal: Story = {
  args: { legal: undefined },
}
