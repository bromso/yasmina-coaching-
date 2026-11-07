import BlurText from "@repo/ui/components/BlurText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/BlurText",
  component: BlurText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "The text content to animate",
    },
    delay: {
      control: { type: "range", min: 50, max: 500, step: 10 },
      description: "Delay in ms between each word/letter animation",
    },
    animateBy: {
      control: { type: "select" },
      options: ["words", "letters"],
      description: "Whether to animate by words or individual letters",
    },
    direction: {
      control: { type: "select" },
      options: ["top", "bottom"],
      description: "Direction the text animates from",
    },
    threshold: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "IntersectionObserver threshold",
    },
    stepDuration: {
      control: { type: "range", min: 0.1, max: 2, step: 0.05 },
      description: "Duration of each animation step in seconds",
    },
    className: {
      control: { type: "text" },
      description: "CSS class applied to the text",
    },
  },
  args: {
    text: "Isn't this so cool?!",
    delay: 200,
    animateBy: "words",
    direction: "top",
    threshold: 0.1,
    stepDuration: 0.35,
    className: "text-4xl font-bold text-white",
  },
} satisfies Meta<typeof BlurText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ByLetters: Story = {
  args: {
    text: "Letter by letter",
    animateBy: "letters",
    delay: 50,
    className: "text-5xl font-black text-white",
  },
}

export const FromBottom: Story = {
  args: {
    text: "Rising from below",
    direction: "bottom",
    className: "text-3xl font-semibold text-white",
  },
}
