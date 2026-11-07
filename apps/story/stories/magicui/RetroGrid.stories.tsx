import { RetroGrid } from "@repo/ui/components/magicui/retro-grid"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Magic UI/Backgrounds/RetroGrid",
  component: RetroGrid,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    angle: {
      control: { type: "number", min: 0, max: 90 },
      description: "Rotation angle of the grid in degrees",
    },
    cellSize: {
      control: { type: "number", min: 20, max: 120 },
      description: "Grid cell size in pixels",
    },
    opacity: {
      control: { type: "number", min: 0, max: 1, step: 0.05 },
      description: "Grid opacity value between 0 and 1",
    },
    lightLineColor: {
      control: "color",
      description: "Grid line color in light mode",
    },
    darkLineColor: {
      control: "color",
      description: "Grid line color in dark mode",
    },
  },
  args: {
    angle: 65,
    cellSize: 60,
    opacity: 0.5,
    lightLineColor: "gray",
    darkLineColor: "gray",
  },
} satisfies Meta<typeof RetroGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-4xl font-bold tracking-tight">Retro Grid</span>
      <RetroGrid {...args} />
    </div>
  ),
}

export const SteepAngle: Story = {
  args: {
    angle: 80,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-4xl font-bold tracking-tight">Steep Angle</span>
      <RetroGrid {...args} />
    </div>
  ),
}

export const ShallowAngle: Story = {
  args: {
    angle: 45,
    cellSize: 40,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <RetroGrid {...args} />
    </div>
  ),
}

export const ColoredLines: Story = {
  args: {
    lightLineColor: "#6366f1",
    darkLineColor: "#818cf8",
    opacity: 0.7,
  },
  render: (args) => (
    <div className="relative flex h-[500px] w-full items-center justify-center overflow-hidden bg-background">
      <span className="z-10 text-4xl font-bold tracking-tight">Colored Grid</span>
      <RetroGrid {...args} />
    </div>
  ),
}
