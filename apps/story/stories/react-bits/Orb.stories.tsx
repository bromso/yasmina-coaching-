import Orb from "@repo/ui/components/Orb"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Orb",
  component: Orb,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    hue: { control: { type: "range", min: 0, max: 360, step: 1 } },
    hoverIntensity: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    rotateOnHover: { control: "boolean" },
    forceHoverState: { control: "boolean" },
    backgroundColor: { control: "color" },
  },
  args: {
    hue: 0,
    hoverIntensity: 0.2,
    rotateOnHover: true,
    forceHoverState: false,
    backgroundColor: "#000000",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Orb>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const GreenOrb: Story = {
  args: {
    hue: 120,
    forceHoverState: true,
    hoverIntensity: 0.5,
  },
}
