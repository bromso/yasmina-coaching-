import Silk from "@repo/ui/components/Silk"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Silk",
  component: Silk,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    speed: { control: { type: "range", min: 0.5, max: 15, step: 0.5 } },
    scale: { control: { type: "range", min: 0.5, max: 5, step: 0.1 } },
    color: { control: "color" },
    noiseIntensity: { control: { type: "range", min: 0, max: 5, step: 0.1 } },
    rotation: { control: { type: "range", min: 0, max: 6.28, step: 0.1 } },
  },
  args: {
    speed: 5,
    scale: 1,
    color: "#7B7481",
    noiseIntensity: 1.5,
    rotation: 0,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Silk>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const BlueRotated: Story = {
  args: {
    color: "#2196F3",
    rotation: 0.8,
    speed: 8,
    scale: 1.5,
  },
}
