import { SectionHeading } from "@repo/ui/components/section-heading"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/SectionHeading",
  component: SectionHeading,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    eyebrow: "Why us",
    title: "Built for speed",
    description: "Everything you need to ship a landing page fast.",
  },
} satisfies Meta<typeof SectionHeading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole("heading", { level: 2, name: "Built for speed" })
    await expect(heading).toBeInTheDocument()
  },
}

export const Start: Story = {
  args: { align: "start" },
}

export const TitleOnly: Story = {
  args: { eyebrow: undefined, description: undefined },
}
