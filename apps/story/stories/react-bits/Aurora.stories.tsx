import Aurora from "@repo/ui/components/Aurora"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Aurora",
  component: Aurora,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    colorStops: {
      control: { type: "object" },
      description: "Array of 3 hex color stops for the aurora gradient",
    },
    amplitude: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Height amplitude of the aurora waves",
    },
    blend: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Blend softness of the aurora edge",
    },
    speed: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "Animation speed multiplier",
    },
  },
  args: {
    colorStops: ["#5227FF", "#7cff67", "#5227FF"],
    amplitude: 1.0,
    blend: 0.5,
    speed: 1.0,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Aurora>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WarmColors: Story = {
  args: {
    colorStops: ["#FF6B35", "#FF2E63", "#FF6B35"],
    amplitude: 1.5,
    blend: 0.3,
    speed: 0.8,
  },
}
