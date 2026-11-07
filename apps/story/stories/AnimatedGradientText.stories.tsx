import { AnimatedGradientText } from "@repo/ui/components/animated-gradient-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/AnimatedGradientText",
  component: AnimatedGradientText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    speed: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
    },
    colorFrom: {
      control: { type: "color" },
    },
    colorTo: {
      control: { type: "color" },
    },
    children: {
      control: { type: "text" },
    },
  },
  args: {
    children: "Animated Gradient Text",
    speed: 1,
    colorFrom: "#ffaa40",
    colorTo: "#9c40ff",
  },
} satisfies Meta<typeof AnimatedGradientText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "text-4xl font-bold",
  },
}

export const SlowAnimation: Story = {
  args: {
    children: "Slow Gradient",
    speed: 0.3,
    className: "text-4xl font-bold",
  },
}

export const FastAnimation: Story = {
  args: {
    children: "Fast Gradient",
    speed: 4,
    className: "text-4xl font-bold",
  },
}

export const CoolColors: Story = {
  args: {
    children: "Ocean Vibes",
    colorFrom: "#0ea5e9",
    colorTo: "#6366f1",
    className: "text-5xl font-extrabold",
  },
}

export const WarmColors: Story = {
  args: {
    children: "Sunset Glow",
    colorFrom: "#f97316",
    colorTo: "#ef4444",
    className: "text-5xl font-extrabold",
  },
}

export const SmallText: Story = {
  args: {
    children: "Small animated text used inline",
    className: "text-sm",
  },
}
