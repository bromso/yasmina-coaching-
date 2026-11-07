import { Ripple } from "@repo/ui/components/magicui/ripple"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Effects/Ripple",
  component: Ripple,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    mainCircleSize: {
      control: { type: "number", min: 50, max: 500 },
      description: "Size of the main (innermost) circle in pixels",
    },
    mainCircleOpacity: {
      control: { type: "number", min: 0, max: 1, step: 0.01 },
      description: "Opacity of the main circle",
    },
    numCircles: {
      control: { type: "number", min: 1, max: 20 },
      description: "Number of ripple circles",
    },
  },
  args: {
    mainCircleSize: 210,
    mainCircleOpacity: 0.24,
    numCircles: 8,
  },
} satisfies Meta<typeof Ripple>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold tracking-tight">Ripple</span>
      <Ripple {...args} />
    </div>
  ),
}

export const FewCircles: Story = {
  args: {
    numCircles: 3,
    mainCircleSize: 150,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <Ripple {...args} />
    </div>
  ),
}

export const ManyCircles: Story = {
  args: {
    numCircles: 15,
    mainCircleSize: 100,
    mainCircleOpacity: 0.3,
  },
  render: (args) => (
    <div className="relative flex h-[600px] w-full items-center justify-center overflow-hidden bg-background">
      <Ripple {...args} />
    </div>
  ),
}
