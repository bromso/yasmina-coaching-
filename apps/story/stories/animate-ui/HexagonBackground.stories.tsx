import { HexagonBackground } from "@repo/ui/components/animate-ui/components/backgrounds/hexagon"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/HexagonBackground",
  component: HexagonBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    hexagonSize: {
      control: { type: "number", min: 50, max: 150, step: 5 },
      description: "Size of each hexagon (minimum 50)",
    },
    hexagonMargin: {
      control: { type: "number", min: 1, max: 10, step: 1 },
      description: "Gap between hexagons in pixels",
    },
  },
} satisfies Meta<typeof HexagonBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="h-[500px] w-full">
      <HexagonBackground {...args}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold">Hexagon Grid</h1>
        </div>
      </HexagonBackground>
    </div>
  ),
}

export const SmallHexagons: Story = {
  render: () => (
    <div className="h-[500px] w-full">
      <HexagonBackground hexagonSize={55} hexagonMargin={2}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold">Small Hexagons</h1>
        </div>
      </HexagonBackground>
    </div>
  ),
}

export const LargeHexagons: Story = {
  render: () => (
    <div className="h-[500px] w-full">
      <HexagonBackground hexagonSize={120} hexagonMargin={4}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold">Large Hexagons</h1>
        </div>
      </HexagonBackground>
    </div>
  ),
}

export const TightGrid: Story = {
  render: () => (
    <div className="h-[500px] w-full">
      <HexagonBackground hexagonSize={75} hexagonMargin={1}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold">Tight Grid</h1>
        </div>
      </HexagonBackground>
    </div>
  ),
}
