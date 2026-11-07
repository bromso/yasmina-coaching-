import Beams from "@repo/ui/components/Beams"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Beams",
  component: Beams,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    beamWidth: {
      control: { type: "range", min: 0.5, max: 5, step: 0.5 },
      description: "Width of each beam",
    },
    beamHeight: {
      control: { type: "range", min: 5, max: 30, step: 1 },
      description: "Height of each beam",
    },
    beamNumber: {
      control: { type: "range", min: 1, max: 30, step: 1 },
      description: "Number of beams",
    },
    lightColor: { control: { type: "color" }, description: "Color of the directional light" },
    speed: {
      control: { type: "range", min: 0, max: 10, step: 0.5 },
      description: "Animation speed",
    },
    noiseIntensity: {
      control: { type: "range", min: 0, max: 5, step: 0.25 },
      description: "Noise grain intensity",
    },
    scale: {
      control: { type: "range", min: 0.05, max: 1, step: 0.05 },
      description: "Noise scale factor",
    },
    rotation: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Rotation angle in degrees",
    },
  },
  args: {
    beamWidth: 2,
    beamHeight: 15,
    beamNumber: 12,
    lightColor: "#ffffff",
    speed: 2,
    noiseIntensity: 1.75,
    scale: 0.2,
    rotation: 0,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Beams>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ColoredBeams: Story = {
  args: {
    lightColor: "#ff6b9d",
    beamNumber: 20,
    speed: 4,
    rotation: 15,
  },
}
