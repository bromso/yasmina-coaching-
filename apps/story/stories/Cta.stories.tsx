import { Cta } from "@repo/ui/blocks/cta"
import { Button } from "@repo/ui/components/button"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/Cta",
  component: Cta,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    title: "Ready to get started?",
    description: "Join teams shipping their landing pages faster.",
    actions: (
      <>
        <Button asChild>
          <a href="/signup">Start</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/contact">Talk to sales</a>
        </Button>
      </>
    ),
  },
} satisfies Meta<typeof Cta>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "Start" })).toBeInTheDocument()
  },
}
