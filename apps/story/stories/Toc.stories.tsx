import { Toc } from "@repo/ui/blocks/toc"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/Toc",
  component: Toc,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    items: [
      { title: "Introduction", url: "#introduction", depth: 2 },
      { title: "Installation", url: "#installation", depth: 2 },
      { title: "Via npm", url: "#via-npm", depth: 3 },
      { title: "Via bun", url: "#via-bun", depth: 3 },
      { title: "Usage", url: "#usage", depth: 2 },
    ],
  },
} satisfies Meta<typeof Toc>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("navigation", { name: "On this page" })).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Via npm" })).toHaveAttribute("href", "#via-npm")
  },
}

export const Empty: Story = {
  args: { items: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument()
  },
}
