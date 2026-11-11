import { ArrowLink } from "@repo/ui/components/arrow-link"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Coaching/ArrowLink",
  component: ArrowLink,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { href: "#kontakt", label: "Boka ett introsamtal" },
} satisfies Meta<typeof ArrowLink>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "Boka ett introsamtal" })
    await expect(link).toHaveAttribute("href", "#kontakt")
  },
}
