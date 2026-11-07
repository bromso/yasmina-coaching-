import CircularText from "@repo/ui/components/CircularText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/CircularText",
  component: CircularText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "Text to display in a circular arrangement",
    },
    spinDuration: {
      control: { type: "range", min: 2, max: 60, step: 1 },
      description: "Duration in seconds for one full rotation",
    },
    onHover: {
      control: { type: "select" },
      options: ["slowDown", "speedUp", "pause", "goBonkers"],
      description: "Behavior when the user hovers over the text",
    },
    className: {
      control: { type: "text" },
      description: "Additional CSS classes",
    },
  },
  args: {
    text: "react-bits-is-cool-*-",
    spinDuration: 20,
    onHover: "speedUp",
  },
} satisfies Meta<typeof CircularText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SlowSpin: Story = {
  args: {
    text: "slowly-spinning-text-*-",
    spinDuration: 40,
    onHover: "pause",
  },
}

export const GoBonkers: Story = {
  args: {
    text: "hover-me-for-chaos-*-",
    spinDuration: 15,
    onHover: "goBonkers",
  },
}
