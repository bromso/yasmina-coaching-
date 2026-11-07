import { FlickeringGrid } from "@repo/ui/components/magicui/flickering-grid"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/FlickeringGrid",
  component: FlickeringGrid,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    squareSize: {
      control: { type: "number", min: 1, max: 20 },
      description: "Size of each square in pixels",
    },
    gridGap: {
      control: { type: "number", min: 0, max: 20 },
      description: "Gap between squares in pixels",
    },
    flickerChance: {
      control: { type: "number", min: 0, max: 1, step: 0.05 },
      description: "Probability of a square flickering per frame",
    },
    color: {
      control: "color",
      description: "Color of the grid squares",
    },
    maxOpacity: {
      control: { type: "number", min: 0, max: 1, step: 0.05 },
      description: "Maximum opacity of squares",
    },
  },
  args: {
    squareSize: 4,
    gridGap: 6,
    flickerChance: 0.3,
    color: "rgb(0, 0, 0)",
    maxOpacity: 0.3,
  },
} satisfies Meta<typeof FlickeringGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative h-[500px] w-full overflow-hidden bg-background">
      <FlickeringGrid {...args} />
    </div>
  ),
}

export const ColoredGrid: Story = {
  args: {
    color: "rgb(99, 102, 241)",
    maxOpacity: 0.5,
  },
  render: (args) => (
    <div className="relative h-[500px] w-full overflow-hidden bg-background">
      <FlickeringGrid {...args} />
    </div>
  ),
}

export const DenseGrid: Story = {
  args: {
    squareSize: 2,
    gridGap: 2,
    flickerChance: 0.5,
  },
  render: (args) => (
    <div className="relative h-[500px] w-full overflow-hidden bg-background">
      <FlickeringGrid {...args} />
    </div>
  ),
}

export const LargeSquares: Story = {
  args: {
    squareSize: 10,
    gridGap: 4,
    flickerChance: 0.2,
    maxOpacity: 0.4,
  },
  render: (args) => (
    <div className="relative h-[500px] w-full overflow-hidden bg-background">
      <FlickeringGrid {...args} />
    </div>
  ),
}

export const Rounded: Story = {
  args: {
    color: "rgb(244, 63, 94)",
    maxOpacity: 0.4,
  },
  render: (args) => (
    <div className="relative mx-auto h-[400px] w-[400px] overflow-hidden rounded-full bg-background">
      <FlickeringGrid {...args} />
    </div>
  ),
}
