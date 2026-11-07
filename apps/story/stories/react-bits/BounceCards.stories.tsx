import BounceCards from "@repo/ui/components/BounceCards"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/BounceCards",
  component: BounceCards,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    images: {
      control: { type: "object" },
      description: "Array of image URLs to display as cards",
    },
    containerWidth: {
      control: { type: "number", min: 200, max: 800 },
      description: "Width of the card container in pixels",
    },
    containerHeight: {
      control: { type: "number", min: 200, max: 800 },
      description: "Height of the card container in pixels",
    },
    animationDelay: {
      control: { type: "number", min: 0, max: 3, step: 0.1 },
      description: "Delay before animation starts (seconds)",
    },
    animationStagger: {
      control: { type: "number", min: 0, max: 0.5, step: 0.01 },
      description: "Stagger between each card animation",
    },
    easeType: {
      control: { type: "text" },
      description: "GSAP easing function string",
    },
    enableHover: {
      control: { type: "boolean" },
      description: "Enable hover interaction to push sibling cards",
    },
  },
  args: {
    images: [
      "https://picsum.photos/seed/1/300/300",
      "https://picsum.photos/seed/2/300/300",
      "https://picsum.photos/seed/3/300/300",
      "https://picsum.photos/seed/4/300/300",
      "https://picsum.photos/seed/5/300/300",
    ],
    containerWidth: 400,
    containerHeight: 400,
    animationDelay: 0.5,
    animationStagger: 0.06,
    easeType: "elastic.out(1, 0.8)",
    enableHover: false,
  },
} satisfies Meta<typeof BounceCards>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithHover: Story = {
  args: {
    enableHover: true,
  },
}
