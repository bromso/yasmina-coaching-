import Iridescence from "@repo/ui/components/Iridescence"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Iridescence",
  component: Iridescence,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: { type: "object" },
      description: "Color multiplier as [r, g, b] normalized values",
    },
    speed: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "Animation speed",
    },
    amplitude: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Mouse influence amplitude",
    },
    mouseReact: { control: "boolean", description: "Enable mouse reactivity" },
  },
  args: {
    color: [1, 1, 1] as [number, number, number],
    speed: 1.0,
    amplitude: 0.1,
    mouseReact: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Iridescence>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WarmTint: Story = {
  args: {
    color: [1.2, 0.8, 0.6] as [number, number, number],
    speed: 0.5,
    amplitude: 0.2,
  },
}
