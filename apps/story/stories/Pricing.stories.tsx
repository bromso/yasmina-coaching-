import { Pricing } from "@repo/ui/blocks/pricing"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/Pricing",
  component: Pricing,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    heading: { eyebrow: "Pricing", title: "Plans for every team" },
    tiers: [
      {
        name: "Free",
        price: "$0",
        description: "For side projects.",
        features: ["1 project", "Community support"],
        cta: { label: "Start", href: "/signup" },
      },
      {
        name: "Pro",
        price: "$19",
        period: "/month",
        description: "For growing teams.",
        features: ["Unlimited projects", "Priority support", "Custom domains"],
        cta: { label: "Start", href: "/signup?plan=pro" },
        highlighted: true,
      },
      {
        name: "Enterprise",
        price: "Contact us",
        description: "For large organizations.",
        features: ["SSO", "Dedicated support", "Custom contracts"],
        cta: { label: "Talk to sales", href: "/contact" },
      },
    ],
    note: "Prices in USD, billed monthly. Cancel anytime.",
  },
} satisfies Meta<typeof Pricing>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "Start with Pro" })).toBeInTheDocument()
  },
}
