import { AnimatedGridPattern } from "@repo/ui/components/magicui/animated-grid-pattern"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/AnimatedGridPattern",
  component: AnimatedGridPattern,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "number", min: 10, max: 100 },
      description: "Width of each grid cell",
    },
    height: {
      control: { type: "number", min: 10, max: 100 },
      description: "Height of each grid cell",
    },
    numSquares: {
      control: { type: "number", min: 5, max: 200 },
      description: "Number of animated highlight squares",
    },
    maxOpacity: {
      control: { type: "number", min: 0.1, max: 1, step: 0.1 },
      description: "Maximum opacity of animated squares",
    },
    duration: {
      control: { type: "number", min: 1, max: 10 },
      description: "Duration of each square animation in seconds",
    },
    repeatDelay: {
      control: { type: "number", min: 0, max: 5, step: 0.1 },
      description: "Delay before repeating the animation",
    },
  },
  args: {
    width: 40,
    height: 40,
    numSquares: 50,
    maxOpacity: 0.5,
    duration: 4,
    repeatDelay: 0.5,
  },
} satisfies Meta<typeof AnimatedGridPattern>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Animated Grid</span>
      <AnimatedGridPattern {...args} />
    </div>
  ),
}

export const Dense: Story = {
  args: {
    width: 20,
    height: 20,
    numSquares: 100,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <AnimatedGridPattern {...args} />
    </div>
  ),
}

export const Subtle: Story = {
  args: {
    maxOpacity: 0.2,
    numSquares: 30,
    duration: 6,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Subtle Animation</span>
      <AnimatedGridPattern {...args} />
    </div>
  ),
}

export const WithMask: Story = {
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Masked Grid</span>
      <AnimatedGridPattern
        {...args}
        className="[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]"
      />
    </div>
  ),
}
