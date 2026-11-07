import TrueFocus from "@repo/ui/components/TrueFocus"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/TrueFocus",
  component: TrueFocus,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    sentence: {
      control: { type: "text" },
      description: "The sentence to display, split by the separator",
    },
    separator: {
      control: { type: "text" },
      description: "Character used to split the sentence into words",
    },
    manualMode: {
      control: { type: "boolean" },
      description: "Focus on hover instead of auto-cycling",
    },
    blurAmount: {
      control: { type: "range", min: 0, max: 20, step: 1 },
      description: "Blur amount in pixels for non-focused words",
    },
    borderColor: {
      control: { type: "color" },
      description: "Color of the focus bracket borders",
    },
    glowColor: {
      control: { type: "text" },
      description: "Glow color for the focus brackets (supports rgba)",
    },
    animationDuration: {
      control: { type: "range", min: 0.1, max: 2, step: 0.1 },
      description: "Duration of focus transition in seconds",
    },
    pauseBetweenAnimations: {
      control: { type: "range", min: 0.2, max: 5, step: 0.1 },
      description: "Pause between auto-cycling focus in seconds",
    },
  },
  args: {
    sentence: "True Focus",
    separator: " ",
    manualMode: false,
    blurAmount: 5,
    borderColor: "green",
    glowColor: "rgba(0, 255, 0, 0.6)",
    animationDuration: 0.5,
    pauseBetweenAnimations: 1,
  },
} satisfies Meta<typeof TrueFocus>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ManualHover: Story = {
  args: {
    sentence: "Hover over each word",
    manualMode: true,
    blurAmount: 8,
    borderColor: "#ff3366",
    glowColor: "rgba(255, 51, 102, 0.6)",
  },
}

export const MultipleWords: Story = {
  args: {
    sentence: "React Bits Is Awesome",
    animationDuration: 0.3,
    pauseBetweenAnimations: 0.8,
    borderColor: "#3366ff",
    glowColor: "rgba(51, 102, 255, 0.6)",
  },
}
