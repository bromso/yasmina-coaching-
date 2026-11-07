import { HyperText } from "@repo/ui/components/hyper-text"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/HyperText",
  component: HyperText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
    },
    duration: {
      control: { type: "number", min: 100, max: 3000, step: 100 },
    },
    delay: {
      control: { type: "number", min: 0, max: 5000, step: 100 },
    },
    animateOnHover: {
      control: { type: "boolean" },
    },
    startOnView: {
      control: { type: "boolean" },
    },
  },
  args: {
    children: "Hyper Text",
    duration: 800,
    delay: 0,
    animateOnHover: true,
    startOnView: false,
  },
} satisfies Meta<typeof HyperText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LongText: Story = {
  args: {
    children: "The quick brown fox jumps",
  },
}

export const FastScramble: Story = {
  args: {
    children: "Fast Scramble",
    duration: 300,
  },
}

export const SlowScramble: Story = {
  args: {
    children: "Slow Reveal",
    duration: 2000,
  },
}

export const WithDelay: Story = {
  args: {
    children: "Delayed Start",
    delay: 1000,
  },
}

export const NoHoverAnimation: Story = {
  args: {
    children: "No Hover Effect",
    animateOnHover: false,
  },
}

export const CustomCharacterSet: Story = {
  args: {
    children: "Binary Mode",
    characterSet: ["0", "1"],
  },
}

export const NumberCharacterSet: Story = {
  args: {
    children: "Matrix Style",
    characterSet: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    className: "text-4xl font-bold text-green-500 font-mono",
  },
}
