import { InteractiveGridPattern } from "@repo/ui/components/magicui/interactive-grid-pattern"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/InteractiveGridPattern",
  component: InteractiveGridPattern,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    width: {
      control: { type: "number", min: 10, max: 100 },
      description: "Width of each square in the grid",
    },
    height: {
      control: { type: "number", min: 10, max: 100 },
      description: "Height of each square in the grid",
    },
  },
  args: {
    width: 40,
    height: 40,
  },
} satisfies Meta<typeof InteractiveGridPattern>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="pointer-events-none z-10 text-2xl font-bold">Hover the grid</span>
      <InteractiveGridPattern {...args} squares={[24, 12]} />
    </div>
  ),
}

export const SmallCells: Story = {
  args: {
    width: 20,
    height: 20,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <InteractiveGridPattern {...args} squares={[48, 24]} />
    </div>
  ),
}

export const LargeCells: Story = {
  args: {
    width: 80,
    height: 80,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <InteractiveGridPattern {...args} squares={[12, 6]} />
    </div>
  ),
}

export const WithMask: Story = {
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="pointer-events-none z-10 text-2xl font-bold">Masked Interactive Grid</span>
      <InteractiveGridPattern
        {...args}
        squares={[24, 12]}
        className="[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]"
      />
    </div>
  ),
}
