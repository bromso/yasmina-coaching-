import { PrevNext } from "@repo/ui/blocks/prev-next"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/PrevNext",
  component: PrevNext,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    prev: { href: "/blog/a-previous-post", title: "A previous post" },
    next: { href: "/blog/a-next-post", title: "A next post" },
  },
} satisfies Meta<typeof PrevNext>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: /A previous post/ })).toHaveAttribute(
      "href",
      "/blog/a-previous-post"
    )
    await expect(canvas.getByRole("link", { name: /A next post/ })).toHaveAttribute(
      "href",
      "/blog/a-next-post"
    )
  },
}

export const PrevOnly: Story = {
  args: { next: undefined },
}

export const Empty: Story = {
  args: { prev: undefined, next: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument()
  },
}
