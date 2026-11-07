import ColorBends from "@repo/ui/components/ColorBends"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/ColorBends",
  component: ColorBends,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    rotation: {
      control: { type: "range", min: 0, max: 360, step: 5 },
      description: "Rotation angle in degrees",
    },
    speed: {
      control: { type: "range", min: 0, max: 2, step: 0.05 },
      description: "Animation speed",
    },
    colors: { control: { type: "object" }, description: "Array of hex colors" },
    transparent: { control: "boolean", description: "Enable transparency" },
    autoRotate: {
      control: { type: "range", min: 0, max: 50, step: 1 },
      description: "Auto-rotation speed in degrees per second",
    },
    scale: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      description: "Scale of the effect",
    },
    frequency: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      description: "Wave frequency",
    },
    warpStrength: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Warp distortion strength",
    },
    mouseInfluence: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Mouse influence on the effect",
    },
    noise: {
      control: { type: "range", min: 0, max: 0.5, step: 0.01 },
      description: "Noise grain amount",
    },
  },
  args: {
    rotation: 45,
    speed: 0.2,
    colors: [],
    transparent: true,
    autoRotate: 0,
    scale: 1,
    frequency: 1,
    warpStrength: 1,
    mouseInfluence: 1,
    parallax: 0.5,
    noise: 0.1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ColorBends>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CustomColors: Story = {
  args: {
    colors: ["#ff0080", "#7928ca", "#0070f3", "#00dfd8"],
    rotation: 90,
    warpStrength: 2,
    speed: 0.3,
  },
}
