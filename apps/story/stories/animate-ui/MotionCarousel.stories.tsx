import { MotionCarousel } from "@repo/ui/components/animate-ui/components/community/motion-carousel"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Community/MotionCarousel",
  component: MotionCarousel,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    slides: {
      control: "object",
    },
  },
  args: {
    slides: Array.from({ length: 5 }, (_, i) => i),
  },
} satisfies Meta<typeof MotionCarousel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ThreeSlides: Story = {
  args: {
    slides: [0, 1, 2],
  },
}

export const ManySlides: Story = {
  args: {
    slides: Array.from({ length: 10 }, (_, i) => i),
  },
}

export const WithLoop: Story = {
  args: {
    slides: Array.from({ length: 5 }, (_, i) => i),
    options: { loop: true },
  },
}

export const DragFree: Story = {
  args: {
    slides: Array.from({ length: 7 }, (_, i) => i),
    options: { dragFree: true },
  },
}

export const StartFromMiddle: Story = {
  args: {
    slides: Array.from({ length: 5 }, (_, i) => i),
    options: { startIndex: 2 },
  },
}
