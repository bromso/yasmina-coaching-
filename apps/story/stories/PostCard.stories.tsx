import { PostCard } from "@repo/ui/blocks/post-card"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/PostCard",
  component: PostCard,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    href: "/blog/shipping-fast",
    title: "Shipping fast without breaking things",
    description: "A look at how we keep velocity high while staying safe in production.",
    date: new Date("2026-09-15"),
    readingMinutes: 6,
    author: { name: "Ada Lovelace", avatar: "https://placehold.co/64x64?text=AL" },
    tags: [
      { tag: "engineering", href: "/tags/engineering" },
      { tag: "process", href: "/tags/process" },
    ],
  },
} satisfies Meta<typeof PostCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("heading", { level: 2, name: "Shipping fast without breaking things" })
    ).toBeInTheDocument()
    await expect(canvas.getByText("6 min read")).toBeInTheDocument()
    await expect(
      canvas.getByRole("link", { name: "Shipping fast without breaking things" })
    ).toHaveAttribute("href", "/blog/shipping-fast")
    await expect(canvas.getByRole("link", { name: "engineering" })).toHaveAttribute(
      "href",
      "/tags/engineering"
    )
  },
}

export const Featured: Story = {
  args: { featured: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("Featured")).toBeInTheDocument()
  },
}

export const NoAvatarNoTags: Story = {
  args: { author: { name: "Grace Hopper" }, tags: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("GH")).toBeInTheDocument()
  },
}

export const UnderASection: Story = {
  args: { headingAs: "h3" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("heading", { level: 3, name: "Shipping fast without breaking things" })
    ).toBeInTheDocument()
  },
}
