import { Newsletter } from "@repo/ui/blocks/newsletter"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fn, within } from "storybook/test"

const meta = {
  title: "Blocks/Newsletter",
  component: Newsletter,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    heading: { eyebrow: "Newsletter", title: "Stay in the loop" },
    description: "One email a month, no spam.",
    action: fn(),
    state: { ok: false },
  },
} satisfies Meta<typeof Newsletter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("button", { name: "Join the waitlist" })).toBeInTheDocument()
    await expect(canvas.getByLabelText("Email")).toBeInTheDocument()
  },
}

export const WithError: Story = {
  args: {
    state: { ok: false, fieldErrors: { email: "Enter a valid email" } },
  },
}
