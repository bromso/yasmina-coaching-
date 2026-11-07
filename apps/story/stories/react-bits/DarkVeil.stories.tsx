import DarkVeil from "@repo/ui/components/DarkVeil"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/DarkVeil",
  component: DarkVeil,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    hueShift: {
      control: { type: "range", min: 0, max: 360, step: 5 },
      description: "Hue shift in degrees",
    },
    noiseIntensity: {
      control: { type: "range", min: 0, max: 0.5, step: 0.01 },
      description: "Noise overlay intensity",
    },
    scanlineIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Scanline effect intensity",
    },
    speed: {
      control: { type: "range", min: 0, max: 2, step: 0.05 },
      description: "Animation speed",
    },
    scanlineFrequency: {
      control: { type: "range", min: 0, max: 20, step: 0.5 },
      description: "Scanline frequency",
    },
    warpAmount: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "UV warp distortion amount",
    },
    resolutionScale: {
      control: { type: "range", min: 0.25, max: 2, step: 0.25 },
      description: "Render resolution scale",
    },
  },
  args: {
    hueShift: 0,
    noiseIntensity: 0,
    scanlineIntensity: 0,
    speed: 0.5,
    scanlineFrequency: 0,
    warpAmount: 0,
    resolutionScale: 1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DarkVeil>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const RetroScanlines: Story = {
  args: {
    hueShift: 120,
    scanlineIntensity: 0.3,
    scanlineFrequency: 8,
    noiseIntensity: 0.05,
    warpAmount: 0.5,
  },
}
