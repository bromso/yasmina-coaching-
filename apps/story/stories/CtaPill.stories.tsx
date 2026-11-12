import { ctaPill } from "@repo/ui/components/cta-pill"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

/** `ctaPill()`: the booking call to action ("Boka") in its three sizes, as www and the blog set it. */
const meta = {
  title: "Components/Coaching/CtaPill",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  render: () => (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <a href="#sm" className={ctaPill({ size: "sm" })}>
        Boka
      </a>
      <a href="#default" className={ctaPill()}>
        Boka
      </a>
      <a href="#lg" className={ctaPill({ size: "lg" })}>
        Boka ett samtal
      </a>
    </div>
  ),
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Sizes: Story = {
  play: async ({ canvasElement }) => {
    const heights = within(canvasElement)
      .getAllByRole("link")
      .map((link) => link.getBoundingClientRect().height)
    await expect(heights).toEqual([30, 36, 44])
  },
}
