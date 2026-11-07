import LiquidChrome from "@repo/ui/components/LiquidChrome"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/LiquidChrome",
  component: LiquidChrome,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    baseColor: { control: "object" },
    speed: { control: { type: "range", min: 0, max: 2, step: 0.05 } },
    amplitude: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
    frequencyX: { control: { type: "range", min: 1, max: 10, step: 0.5 } },
    frequencyY: { control: { type: "range", min: 1, max: 10, step: 0.5 } },
    interactive: { control: "boolean" },
  },
  args: {
    baseColor: [0.1, 0.1, 0.1],
    speed: 0.2,
    amplitude: 0.5,
    frequencyX: 3,
    frequencyY: 2,
    interactive: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiquidChrome>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FastBlue: Story = {
  args: {
    baseColor: [0.1, 0.1, 0.3],
    speed: 0.6,
    amplitude: 0.8,
    frequencyX: 5,
  },
}
