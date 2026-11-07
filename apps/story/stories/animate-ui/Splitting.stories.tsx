import { SplittingText } from "@repo/ui/components/animate-ui/primitives/texts/splitting"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/Splitting",
  component: SplittingText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["chars", "words", "lines"],
    },
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
    stagger: {
      control: { type: "number", min: 0.01, max: 1, step: 0.01 },
    },
    disableAnimation: {
      control: "boolean",
    },
    inView: {
      control: "boolean",
    },
    inViewOnce: {
      control: "boolean",
    },
  },
  args: {
    type: "chars",
    delay: 0,
    disableAnimation: false,
    inView: false,
    inViewOnce: true,
  },
} satisfies Meta<typeof SplittingText>

export default meta
type Story = StoryObj<typeof meta>

export const CharByChar: Story = {
  args: {
    text: "Hello World",
    type: "chars",
    className: "text-3xl font-bold",
  },
}

export const WordByWord: Story = {
  args: {
    text: "Each word animates individually",
    type: "words",
    className: "text-2xl font-semibold",
  },
}

export const LineByLine: Story = {
  args: {
    text: ["First line appears", "Then the second line", "And finally the third"],
    type: "lines",
    className: "text-xl font-medium",
  },
}

export const SlowStagger: Story = {
  args: {
    text: "Slow reveal",
    type: "chars",
    stagger: 0.15,
    className: "text-4xl font-black",
  },
}

export const SlideFromLeft: Story = {
  args: {
    text: "Sliding in from the left",
    type: "chars",
    initial: { x: -50, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    className: "text-2xl font-bold",
  },
}

export const FadeUp: Story = {
  args: {
    text: "Fading up word by word",
    type: "words",
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    className: "text-2xl font-semibold",
  },
}

export const WithDelay: Story = {
  args: {
    text: "This starts after a delay",
    type: "chars",
    delay: 1000,
    className: "text-xl font-medium",
  },
}
