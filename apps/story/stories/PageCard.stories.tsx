import { legalPath } from "@repo/sites/legal"
import { PageCard } from "@repo/ui/blocks/post-card"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/PageCard",
  component: PageCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    href: legalPath("privacy", "sv"),
    title: "Integritet och cookies",
    description: "Vilka uppgifter webbplatsen samlar in, varför, hur länge de sparas.",
    date: new Date("2026-11-12"),
    dateLabel: "Senast uppdaterad",
    dateLocale: "sv-SE",
  },
} satisfies Meta<typeof PageCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("heading", { level: 2, name: "Integritet och cookies" })
    ).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Integritet och cookies" })).toHaveAttribute(
      "href",
      legalPath("privacy", "sv")
    )
    await expect(canvas.getByText("12 nov. 2026")).toHaveAttribute("datetime", "2026-11-12")
    await expect(canvas.getByText(/Senast uppdaterad/)).toBeInTheDocument()
    // A page, not a post: one link, no author or reading time.
    await expect(canvas.getAllByRole("link")).toHaveLength(1)
  },
}

/** The legal index's cards: under the section's own h2, in the blog's www look. */
export const LegalIndex: Story = {
  args: {
    headingAs: "h3",
    className: "overflow-hidden rounded-3xl",
    titleClassName: "font-display font-normal text-2xl leading-tight",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("heading", { level: 3, name: "Integritet och cookies" })
    ).toBeInTheDocument()
  },
}
