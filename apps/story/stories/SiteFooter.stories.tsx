import { BRAND_NAME } from "@repo/sites"
import { SiteFooter } from "@repo/ui/blocks/site-footer"
import { Brand } from "@repo/ui/components/brand"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

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
      <p className="flex flex-wrap gap-x-2">
        <span>© 2026 {BRAND_NAME}</span>
        <span aria-hidden="true">·</span>
        <a href="https://www.brand.com/terms" className="hover:text-foreground">
          Terms
        </a>
        <span aria-hidden="true">·</span>
        <a href="https://www.brand.com/privacy" className="hover:text-foreground">
          Privacy
        </a>
      </p>
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
    await expect(canvas.getByText(`© 2026 ${BRAND_NAME}`)).toBeVisible()
  },
}

export const WithoutLegal: Story = {
  args: { legal: undefined },
}
