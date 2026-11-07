import PixelTransition from "@repo/ui/components/PixelTransition"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/PixelTransition",
  component: PixelTransition,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    gridSize: {
      control: { type: "range", min: 3, max: 20, step: 1 },
      description: "Number of pixel blocks per row/column",
    },
    pixelColor: {
      control: { type: "color" },
      description: "Color of the transition pixel blocks",
    },
    animationStepDuration: {
      control: { type: "range", min: 0.1, max: 1, step: 0.05 },
      description: "Duration of the pixel reveal animation in seconds",
    },
    once: {
      control: { type: "boolean" },
      description: "Only allow the transition to happen once (no reverse on leave)",
    },
    aspectRatio: {
      control: { type: "text" },
      description: "Aspect ratio as a CSS padding-top percentage",
    },
  },
  args: {
    gridSize: 7,
    pixelColor: "currentColor",
    animationStepDuration: 0.3,
    once: false,
    aspectRatio: "100%",
  },
} satisfies Meta<typeof PixelTransition>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    firstContent: (
      <img
        src="https://picsum.photos/seed/pixel1/300/300"
        alt="First"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ),
    secondContent: (
      <img
        src="https://picsum.photos/seed/pixel2/300/300"
        alt="Second"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ),
  },
}

export const FineGrid: Story = {
  args: {
    gridSize: 14,
    animationStepDuration: 0.5,
    pixelColor: "#5227FF",
    firstContent: (
      <img
        src="https://picsum.photos/seed/pixel3/300/300"
        alt="First"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ),
    secondContent: (
      <img
        src="https://picsum.photos/seed/pixel4/300/300"
        alt="Second"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ),
  },
}
