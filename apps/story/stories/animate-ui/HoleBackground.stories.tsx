import { HoleBackground } from "@repo/ui/components/animate-ui/components/backgrounds/hole"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/HoleBackground",
  component: HoleBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    strokeColor: {
      control: "color",
      description: "Color of the elliptical grid lines",
    },
    numberOfLines: {
      control: { type: "number", min: 10, max: 100, step: 5 },
      description: "Number of radial lines in the tunnel",
    },
    numberOfDiscs: {
      control: { type: "number", min: 10, max: 100, step: 5 },
      description: "Number of elliptical discs forming the tunnel",
    },
    particleRGBColor: {
      control: "object",
      description: "RGB color tuple for floating particles",
    },
  },
} satisfies Meta<typeof HoleBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="h-[500px] w-full bg-black">
      <HoleBackground {...args}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Black Hole</h1>
        </div>
      </HoleBackground>
    </div>
  ),
}

export const CustomStrokeColor: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black">
      <HoleBackground strokeColor="#4f46e5">
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Indigo Lines</h1>
        </div>
      </HoleBackground>
    </div>
  ),
}

export const DenseGrid: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black">
      <HoleBackground numberOfLines={80} numberOfDiscs={80}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Dense Grid</h1>
        </div>
      </HoleBackground>
    </div>
  ),
}

export const ColoredParticles: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black">
      <HoleBackground particleRGBColor={[100, 200, 255]} strokeColor="#3b82f6">
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Blue Particles</h1>
        </div>
      </HoleBackground>
    </div>
  ),
}
