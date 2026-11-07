import { GradientBackground } from "@repo/ui/components/animate-ui/components/backgrounds/gradient"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Backgrounds/GradientBackground",
  component: GradientBackground,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof GradientBackground>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <GradientBackground className="h-[500px] flex items-center justify-center" {...args}>
      <h1 className="text-4xl font-bold text-white">Gradient Background</h1>
    </GradientBackground>
  ),
}

export const CustomGradient: Story = {
  render: () => (
    <GradientBackground className="h-[500px] flex items-center justify-center bg-gradient-to-br from-green-400 via-cyan-500 to-blue-600 bg-[length:400%_400%]">
      <h1 className="text-4xl font-bold text-white">Ocean Theme</h1>
    </GradientBackground>
  ),
}

export const SlowAnimation: Story = {
  render: () => (
    <GradientBackground
      className="h-[500px] flex items-center justify-center"
      transition={{ duration: 30, ease: "easeInOut", repeat: Infinity }}
    >
      <h1 className="text-4xl font-bold text-white">Slow Animation</h1>
    </GradientBackground>
  ),
}

export const WarmGradient: Story = {
  render: () => (
    <GradientBackground className="h-[500px] flex items-center justify-center bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 bg-[length:400%_400%]">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-5xl font-bold text-white">Sunset</h1>
        <p className="text-lg text-white/80">Warm gradient animation</p>
      </div>
    </GradientBackground>
  ),
}
