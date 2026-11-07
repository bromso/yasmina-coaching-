import { FireworksBackground } from "@repo/ui/components/animate-ui/components/backgrounds/fireworks"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/FireworksBackground",
  component: FireworksBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    population: {
      control: { type: "number", min: 0.5, max: 5, step: 0.5 },
      description: "Controls launch frequency (higher = more fireworks)",
    },
    color: {
      control: "object",
      description: "Color(s) for the fireworks. String or array of strings.",
    },
  },
} satisfies Meta<typeof FireworksBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div className="h-[500px] w-full bg-black">
      <FireworksBackground {...args}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Click anywhere!</h1>
        </div>
      </FireworksBackground>
    </div>
  ),
}

export const HighPopulation: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-black">
      <FireworksBackground population={3}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">Celebration!</h1>
        </div>
      </FireworksBackground>
    </div>
  ),
}

export const CustomColors: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-gray-950">
      <FireworksBackground color={["#ff0000", "#00ff00", "#0000ff"]}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-white">RGB Fireworks</h1>
        </div>
      </FireworksBackground>
    </div>
  ),
}

export const GoldFireworks: Story = {
  render: () => (
    <div className="h-[500px] w-full bg-gray-950">
      <FireworksBackground color="#ffd700" population={2}>
        <div className="relative z-10 flex items-center justify-center size-full">
          <h1 className="text-4xl font-bold text-yellow-400">Golden Night</h1>
        </div>
      </FireworksBackground>
    </div>
  ),
}
