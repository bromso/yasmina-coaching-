import { ShimmeringText } from "@repo/ui/components/animate-ui/primitives/texts/shimmering"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/Shimmering",
  component: ShimmeringText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: "text",
    },
    duration: {
      control: { type: "number", min: 0.2, max: 5, step: 0.1 },
    },
    wave: {
      control: "boolean",
    },
    color: {
      control: "color",
    },
    shimmeringColor: {
      control: "color",
    },
  },
  args: {
    text: "Shimmering",
    duration: 1,
    wave: false,
  },
} satisfies Meta<typeof ShimmeringText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    text: "Shimmering Text",
    className: "text-3xl font-bold",
  },
}

export const WaveEffect: Story = {
  args: {
    text: "Wave Shimmer",
    className: "text-3xl font-bold",
    wave: true,
  },
}

export const SlowShimmer: Story = {
  args: {
    text: "Slow and Elegant",
    className: "text-2xl font-semibold",
    duration: 3,
  },
}

export const FastShimmer: Story = {
  args: {
    text: "Quick Shimmer",
    className: "text-2xl font-semibold",
    duration: 0.5,
  },
}

export const CustomColors: Story = {
  args: {
    text: "Custom Colors",
    className: "text-3xl font-bold",
    color: "#3b82f6",
    shimmeringColor: "#93c5fd",
    wave: true,
  },
}
