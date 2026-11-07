import { GridPattern } from "@repo/ui/components/magicui/grid-pattern"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/GridPattern",
  component: GridPattern,
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
    strokeDasharray: {
      control: "text",
      description: "SVG stroke dash array for dashed lines",
    },
  },
  args: {
    width: 40,
    height: 40,
    strokeDasharray: "0",
  },
} satisfies Meta<typeof GridPattern>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Grid Pattern</span>
      <GridPattern {...args} />
    </div>
  ),
}

export const Dashed: Story = {
  args: {
    strokeDasharray: "4 2",
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Dashed Grid</span>
      <GridPattern {...args} />
    </div>
  ),
}

export const WithHighlightedSquares: Story = {
  render: () => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-2xl font-bold">Highlighted Squares</span>
      <GridPattern
        squares={[
          [1, 1],
          [3, 3],
          [5, 2],
          [7, 5],
          [2, 6],
          [4, 4],
        ]}
        className="[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]"
      />
    </div>
  ),
}

export const LargeCells: Story = {
  args: {
    width: 80,
    height: 80,
  },
  render: (args) => (
    <div className="relative flex h-[400px] w-full items-center justify-center overflow-hidden bg-background">
      <GridPattern {...args} />
    </div>
  ),
}
