import Cubes from "@repo/ui/components/Cubes"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/Cubes",
  component: Cubes,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    gridSize: {
      control: { type: "range", min: 3, max: 20, step: 1 },
      description: "Number of cubes per row and column",
    },
    maxAngle: {
      control: { type: "range", min: 10, max: 90, step: 5 },
      description: "Maximum tilt angle in degrees",
    },
    radius: {
      control: { type: "range", min: 1, max: 10, step: 1 },
      description: "Radius of the tilt effect around the pointer",
    },
    borderStyle: {
      control: { type: "text" },
      description: "CSS border style for cube faces",
    },
    faceColor: {
      control: { type: "color" },
      description: "Background color of cube faces",
    },
    autoAnimate: {
      control: { type: "boolean" },
      description: "Enable idle auto-animation when not hovering",
    },
    rippleOnClick: {
      control: { type: "boolean" },
      description: "Enable color ripple effect on click",
    },
    rippleColor: {
      control: { type: "color" },
      description: "Color of the click ripple effect",
    },
    rippleSpeed: {
      control: { type: "range", min: 0.5, max: 5, step: 0.5 },
      description: "Speed multiplier for the ripple animation",
    },
  },
  args: {
    gridSize: 10,
    maxAngle: 45,
    radius: 3,
    borderStyle: "1px solid #fff",
    faceColor: "#060010",
    autoAnimate: true,
    rippleOnClick: true,
    rippleColor: "#fff",
    rippleSpeed: 2,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 500, height: 500, display: "grid", placeItems: "center" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Cubes>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SmallGrid: Story = {
  args: {
    gridSize: 5,
    maxAngle: 60,
    radius: 2,
    faceColor: "#1a1a2e",
    rippleColor: "#5227FF",
  },
}
