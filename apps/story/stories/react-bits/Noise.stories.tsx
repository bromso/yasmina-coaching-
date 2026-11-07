import Noise from "@repo/ui/components/Noise"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/Noise",
  component: Noise,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    patternRefreshInterval: {
      control: { type: "range", min: 1, max: 10, step: 1 },
      description: "Frames between noise pattern refreshes (lower = faster)",
    },
    patternAlpha: {
      control: { type: "range", min: 5, max: 80, step: 5 },
      description: "Alpha transparency of the noise (0-255)",
    },
  },
  args: {
    patternRefreshInterval: 2,
    patternAlpha: 15,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 400,
          height: 300,
          position: "relative",
          overflow: "hidden",
          borderRadius: 12,
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          display: "grid",
          placeItems: "center",
          color: "white",
        }}
      >
        <p style={{ fontSize: 20, margin: 0, zIndex: 1 }}>Noise Overlay</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Noise>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const HeavyGrain: Story = {
  args: {
    patternAlpha: 50,
    patternRefreshInterval: 1,
  },
}
