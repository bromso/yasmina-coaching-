import { GradientText } from "@repo/ui/components/animate-ui/primitives/texts/gradient"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/GradientText",
  component: GradientText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: "text",
    },
    gradient: {
      control: "text",
    },
    neon: {
      control: "boolean",
    },
  },
  args: {
    text: "Gradient Text",
    neon: false,
  },
} satisfies Meta<typeof GradientText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    text: "Beautiful Gradient",
    className: "text-4xl font-bold",
  },
}

export const NeonEffect: Story = {
  args: {
    text: "Neon Glow",
    className: "text-4xl font-bold",
    neon: true,
  },
}

export const CustomGradient: Story = {
  args: {
    text: "Custom Colors",
    className: "text-4xl font-bold",
    gradient:
      "linear-gradient(90deg, #f97316 0%, #ef4444 25%, #ec4899 50%, #8b5cf6 75%, #3b82f6 100%)",
  },
}

export const GreenToBlue: Story = {
  args: {
    text: "Nature Gradient",
    className: "text-3xl font-semibold",
    gradient: "linear-gradient(90deg, #22c55e 0%, #06b6d4 50%, #3b82f6 100%)",
  },
}

export const NeonCustomColors: Story = {
  args: {
    text: "Glowing Text",
    className: "text-5xl font-black",
    neon: true,
    gradient: "linear-gradient(90deg, #f472b6 0%, #c084fc 50%, #818cf8 100%)",
  },
}
