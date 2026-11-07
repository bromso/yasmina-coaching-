import { Faq } from "@repo/ui/blocks/faq"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Blocks/Faq",
  component: Faq,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    heading: { eyebrow: "FAQ", title: "Frequently asked questions" },
    jsonLd: true,
    items: [
      { question: "Can I cancel anytime?", answer: "Yes, cancel from your account settings." },
      {
        question: "Do you offer a free trial?",
        answer: "Yes, every plan starts with 14 days free.",
      },
      {
        question: "Where can I find more detail?",
        answer: (
          <p>
            See our <a href="/docs">docs</a> for the full picture.
          </p>
        ),
      },
    ],
  },
} satisfies Meta<typeof Faq>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole("button", { name: "Can I cancel anytime?" })
    await userEvent.click(trigger)
    await expect(canvas.getByText("Yes, cancel from your account settings.")).toBeInTheDocument()
    await userEvent.click(trigger)
    await expect(trigger).toHaveAttribute("aria-expanded", "false")
  },
}
