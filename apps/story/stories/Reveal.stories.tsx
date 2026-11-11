import { Reveal, RevealItem } from "@repo/ui/components/motion/reveal"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

/**
 * Anything already on screen when the page hydrates stays as it is, so these stories show the
 * resting state; scroll a long page to see the rise. Nothing moves under reduced motion.
 */
const meta = {
  title: "Components/Coaching/Reveal",
  component: Reveal,
  tags: ["autodocs"],
  args: { children: null },
} satisfies Meta<typeof Reveal>

export default meta
type Story = StoryObj<typeof meta>

export const Single: Story = {
  render: () => (
    <Reveal className="max-w-md rounded-4xl bg-sun-soft p-8">
      <p>Fades in and rises once, when scrolled into view.</p>
    </Reveal>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/rises once/)).toBeVisible()
  },
}

export const Staggered: Story = {
  render: () => (
    <Reveal as="ul" stagger={120} className="grid max-w-md gap-3">
      {["Lyssna", "Förstå", "Leda"].map((step, index) => (
        <RevealItem as="li" key={step} index={index} className="rounded-3xl bg-sun-soft p-5">
          {step}
        </RevealItem>
      ))}
    </Reveal>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("listitem")).toHaveLength(3)
  },
}
