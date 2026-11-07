import { Testimonials } from "@repo/ui/blocks/testimonials"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const items = [
  {
    quote: "We shipped our landing page in an afternoon.",
    name: "Ada Lovelace",
    role: "CTO, Analytical Engines",
    avatar: { initials: "AL" },
  },
  {
    quote: "The blocks are exactly what we needed, no more no less.",
    name: "Grace Hopper",
    role: "VP Engineering",
    avatar: { src: "https://placehold.co/64x64?text=GH", initials: "GH" },
  },
  {
    quote: "Accessible by default, which saved us a whole audit.",
    name: "Alan Turing",
    avatar: { initials: "AT" },
  },
]

const meta = {
  title: "Blocks/Testimonials",
  component: Testimonials,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    heading: { eyebrow: "Social proof", title: "Loved by teams" },
    items,
  },
} satisfies Meta<typeof Testimonials>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole("figure")).toHaveLength(items.length)
  },
}

export const WithoutHeading: Story = {
  args: { heading: undefined },
}
