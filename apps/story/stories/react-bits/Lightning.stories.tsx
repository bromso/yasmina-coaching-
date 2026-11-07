import Lightning from "@repo/ui/components/Lightning"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Lightning",
  component: Lightning,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    hue: { control: { type: "range", min: 0, max: 360, step: 1 } },
    xOffset: { control: { type: "range", min: -2, max: 2, step: 0.1 } },
    speed: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    intensity: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    size: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
  },
  args: {
    hue: 230,
    xOffset: 0,
    speed: 1,
    intensity: 1,
    size: 1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Lightning>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const RedLightning: Story = {
  args: {
    hue: 0,
    intensity: 2,
    speed: 1.5,
  },
}
