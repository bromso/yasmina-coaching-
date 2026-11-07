import FlyingPosters from "@repo/ui/components/FlyingPosters"
import type { Meta, StoryObj } from "@storybook/react-vite"

const defaultImages = [
  "https://picsum.photos/seed/fp1/800/800",
  "https://picsum.photos/seed/fp2/800/800",
  "https://picsum.photos/seed/fp3/800/800",
  "https://picsum.photos/seed/fp4/800/800",
  "https://picsum.photos/seed/fp5/800/800",
  "https://picsum.photos/seed/fp6/800/800",
]

const meta = {
  title: "React Bits/Components/FlyingPosters",
  component: FlyingPosters,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    planeWidth: {
      control: { type: "number", min: 100, max: 600 },
      description: "Width of each poster plane",
    },
    planeHeight: {
      control: { type: "number", min: 100, max: 600 },
      description: "Height of each poster plane",
    },
    distortion: {
      control: { type: "number", min: 0, max: 10, step: 0.5 },
      description: "Amount of 3D distortion on scroll",
    },
    scrollEase: {
      control: { type: "number", min: 0.005, max: 0.1, step: 0.005 },
      description: "Scroll easing factor",
    },
    cameraFov: {
      control: { type: "number", min: 20, max: 90 },
      description: "Camera field of view",
    },
    cameraZ: {
      control: { type: "number", min: 10, max: 40 },
      description: "Camera distance from the scene",
    },
  },
  args: {
    items: defaultImages,
    planeWidth: 320,
    planeHeight: 320,
    distortion: 3,
    scrollEase: 0.01,
    cameraFov: 45,
    cameraZ: 20,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FlyingPosters>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LargePosters: Story = {
  args: {
    planeWidth: 500,
    planeHeight: 500,
    distortion: 5,
  },
}
