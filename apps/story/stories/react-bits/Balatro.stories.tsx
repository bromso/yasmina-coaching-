import Balatro from "@repo/ui/components/Balatro"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Balatro",
  component: Balatro,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    color1: { control: { type: "color" }, description: "Primary color" },
    color2: { control: { type: "color" }, description: "Secondary color" },
    color3: { control: { type: "color" }, description: "Tertiary color" },
    spinSpeed: {
      control: { type: "range", min: 0, max: 20, step: 0.5 },
      description: "Speed of the spin animation",
    },
    spinRotation: {
      control: { type: "range", min: -10, max: 10, step: 0.5 },
      description: "Rotation intensity of the spin",
    },
    contrast: {
      control: { type: "range", min: 0.5, max: 10, step: 0.5 },
      description: "Color contrast level",
    },
    lighting: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Lighting intensity",
    },
    spinAmount: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Amount of spin distortion",
    },
    pixelFilter: {
      control: { type: "range", min: 100, max: 2000, step: 50 },
      description: "Pixel filter resolution",
    },
    isRotate: { control: "boolean", description: "Enable continuous rotation" },
    mouseInteraction: { control: "boolean", description: "Enable mouse interaction" },
  },
  args: {
    color1: "#DE443B",
    color2: "#006BB4",
    color3: "#162325",
    spinSpeed: 7.0,
    spinRotation: -2.0,
    contrast: 3.5,
    lighting: 0.4,
    spinAmount: 0.25,
    pixelFilter: 745.0,
    isRotate: false,
    mouseInteraction: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Balatro>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Rotating: Story = {
  args: {
    isRotate: true,
    color1: "#FF6B35",
    color2: "#1A1A2E",
    color3: "#16213E",
    spinSpeed: 3.0,
  },
}
