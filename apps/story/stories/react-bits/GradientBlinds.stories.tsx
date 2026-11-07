import GradientBlinds from "@repo/ui/components/GradientBlinds"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/GradientBlinds",
  component: GradientBlinds,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    gradientColors: {
      control: { type: "object" },
      description: "Array of hex colors for the gradient",
    },
    angle: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Rotation angle in degrees",
    },
    noise: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Noise grain amount",
    },
    blindCount: {
      control: { type: "range", min: 1, max: 50, step: 1 },
      description: "Number of blinds/stripes",
    },
    blindMinWidth: {
      control: { type: "range", min: 0, max: 200, step: 10 },
      description: "Minimum width of blinds in pixels",
    },
    mirrorGradient: { control: "boolean", description: "Mirror the gradient" },
    spotlightRadius: {
      control: { type: "range", min: 0.1, max: 2, step: 0.1 },
      description: "Spotlight radius",
    },
    spotlightSoftness: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Spotlight edge softness",
    },
    spotlightOpacity: {
      control: { type: "range", min: 0, max: 2, step: 0.1 },
      description: "Spotlight opacity",
    },
    distortAmount: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "UV distortion amount",
    },
    shineDirection: {
      control: { type: "select" },
      options: ["left", "right"],
      description: "Direction of the shine/stripe effect",
    },
    paused: { control: "boolean", description: "Pause rendering" },
  },
  args: {
    gradientColors: ["#FF9FFC", "#5227FF"],
    angle: 0,
    noise: 0.3,
    blindCount: 16,
    blindMinWidth: 60,
    mirrorGradient: false,
    spotlightRadius: 0.5,
    spotlightSoftness: 1,
    spotlightOpacity: 1,
    distortAmount: 0,
    shineDirection: "left",
    paused: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GradientBlinds>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const RainbowDistorted: Story = {
  args: {
    gradientColors: ["#ff0000", "#ff8800", "#ffff00", "#00ff00", "#0088ff", "#8800ff"],
    blindCount: 24,
    distortAmount: 2,
    mirrorGradient: true,
    angle: 45,
  },
}
