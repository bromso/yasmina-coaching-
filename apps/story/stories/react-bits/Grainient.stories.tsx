import Grainient from "@repo/ui/components/Grainient"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Grainient",
  component: Grainient,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    color1: { control: { type: "color" }, description: "First gradient color" },
    color2: { control: { type: "color" }, description: "Second gradient color" },
    color3: { control: { type: "color" }, description: "Third gradient color" },
    timeSpeed: {
      control: { type: "range", min: 0, max: 2, step: 0.05 },
      description: "Animation time speed",
    },
    warpStrength: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      description: "UV warp strength",
    },
    warpFrequency: {
      control: { type: "range", min: 0.5, max: 15, step: 0.5 },
      description: "Warp oscillation frequency",
    },
    grainAmount: {
      control: { type: "range", min: 0, max: 0.5, step: 0.01 },
      description: "Film grain amount",
    },
    contrast: {
      control: { type: "range", min: 0.5, max: 3, step: 0.1 },
      description: "Color contrast",
    },
    saturation: {
      control: { type: "range", min: 0, max: 2, step: 0.1 },
      description: "Color saturation",
    },
    zoom: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
      description: "Zoom level",
    },
    rotationAmount: {
      control: { type: "range", min: 0, max: 1000, step: 50 },
      description: "Rotation distortion amount",
    },
    grainAnimated: { control: "boolean", description: "Animate the grain" },
  },
  args: {
    color1: "#FF9FFC",
    color2: "#5227FF",
    color3: "#B19EEF",
    timeSpeed: 0.25,
    warpStrength: 1.0,
    warpFrequency: 5.0,
    grainAmount: 0.1,
    contrast: 1.5,
    saturation: 1.0,
    zoom: 0.9,
    rotationAmount: 500,
    grainAnimated: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Grainient>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SunsetTones: Story = {
  args: {
    color1: "#FF6B35",
    color2: "#FF2E63",
    color3: "#1A1A2E",
    contrast: 2.0,
    grainAmount: 0.15,
    grainAnimated: true,
  },
}
