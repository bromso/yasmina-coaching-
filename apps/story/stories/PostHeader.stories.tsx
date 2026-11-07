import { PostHeader } from "@repo/ui/blocks/post-header"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/PostHeader",
  component: PostHeader,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    title: "Shipping fast without breaking things",
    description: "A look at how we keep velocity high while staying safe in production.",
    date: new Date("2026-09-15"),
    readingMinutes: 6,
    author: {
      name: "Ada Lovelace",
      avatar: "https://placehold.co/64x64?text=AL",
      href: "/authors/ada-lovelace",
    },
    tags: [
      { tag: "engineering", href: "/tags/engineering" },
      { tag: "process", href: "/tags/process" },
    ],
  },
} satisfies Meta<typeof PostHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("heading", { level: 1, name: "Shipping fast without breaking things" })
    ).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: /Ada Lovelace/ })).toHaveAttribute(
      "href",
      "/authors/ada-lovelace"
    )
  },
}

export const Updated: Story = {
  args: { updated: new Date("2026-09-20") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Updated/)).toBeInTheDocument()
  },
}

export const WithCover: Story = {
  args: { cover: { src: "https://placehold.co/1200x630", alt: "Cover illustration" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByAltText("Cover illustration")).toBeInTheDocument()
  },
}
