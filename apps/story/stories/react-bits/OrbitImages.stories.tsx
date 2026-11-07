import OrbitImages from "@repo/ui/components/OrbitImages"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleImages = [
  "https://picsum.photos/seed/orbit1/100/100",
  "https://picsum.photos/seed/orbit2/100/100",
  "https://picsum.photos/seed/orbit3/100/100",
  "https://picsum.photos/seed/orbit4/100/100",
  "https://picsum.photos/seed/orbit5/100/100",
  "https://picsum.photos/seed/orbit6/100/100",
]

const meta = {
  title: "React Bits/Animations/OrbitImages",
  component: OrbitImages,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    shape: {
      control: { type: "select" },
      options: [
        "ellipse",
        "circle",
        "square",
        "rectangle",
        "triangle",
        "star",
        "heart",
        "infinity",
        "wave",
      ],
      description: "Shape of the orbit path",
    },
    radiusX: {
      control: { type: "range", min: 100, max: 600, step: 10 },
      description: "Horizontal radius (for ellipse and rectangle shapes)",
    },
    radiusY: {
      control: { type: "range", min: 50, max: 400, step: 10 },
      description: "Vertical radius (for ellipse and rectangle shapes)",
    },
    radius: {
      control: { type: "range", min: 50, max: 500, step: 10 },
      description: "Radius for circular shapes (circle, square, triangle, star)",
    },
    rotation: {
      control: { type: "range", min: -45, max: 45, step: 1 },
      description: "Rotation angle of the entire orbit",
    },
    duration: {
      control: { type: "range", min: 5, max: 120, step: 5 },
      description: "Duration of one full orbit in seconds",
    },
    itemSize: {
      control: { type: "range", min: 24, max: 128, step: 4 },
      description: "Size of each orbiting image in pixels",
    },
    direction: {
      control: { type: "select" },
      options: ["normal", "reverse"],
      description: "Direction of orbit rotation",
    },
    fill: {
      control: { type: "boolean" },
      description: "Distribute items evenly around the path",
    },
    showPath: {
      control: { type: "boolean" },
      description: "Show the orbit path outline",
    },
    paused: {
      control: { type: "boolean" },
      description: "Pause the animation",
    },
  },
  args: {
    images: sampleImages,
    shape: "ellipse",
    radiusX: 250,
    radiusY: 80,
    rotation: -8,
    duration: 40,
    itemSize: 64,
    direction: "normal",
    fill: true,
    width: 600,
    height: 400,
    showPath: false,
    paused: false,
  },
} satisfies Meta<typeof OrbitImages>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CircleWithPath: Story = {
  args: {
    shape: "circle",
    radius: 150,
    showPath: true,
    pathColor: "rgba(255,255,255,0.2)",
    rotation: 0,
    duration: 20,
    itemSize: 48,
    width: 400,
    height: 400,
  },
}
