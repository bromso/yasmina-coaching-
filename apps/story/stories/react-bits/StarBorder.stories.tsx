import StarBorder from "@repo/ui/components/StarBorder"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/StarBorder",
  component: StarBorder,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: { type: "color" },
      description: "Color of the animated star/glow effect",
    },
    speed: {
      control: { type: "text" },
      description: "CSS animation duration (e.g., '6s', '3s')",
    },
    thickness: {
      control: { type: "range", min: 1, max: 5, step: 1 },
      description: "Thickness of the border glow in pixels",
    },
  },
  args: {
    color: "white",
    speed: "6s",
    thickness: 1,
  },
} satisfies Meta<typeof StarBorder>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Star Border Button",
  },
}

export const ColoredFast: Story = {
  args: {
    color: "#5227FF",
    speed: "3s",
    thickness: 2,
    children: "Purple Glow",
  },
}
