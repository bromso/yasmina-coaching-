import { RollingText } from "@repo/ui/components/animate-ui/primitives/texts/rolling"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Texts/Rolling",
  component: RollingText,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: "text",
    },
    delay: {
      control: { type: "number", min: 0, max: 3000, step: 100 },
    },
  },
  args: {
    text: "Rolling Text",
    delay: 0,
  },
} satisfies Meta<typeof RollingText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    text: "Rolling Text",
    className: "text-3xl font-bold",
  },
}

export const LongText: Story = {
  args: {
    text: "Each character rolls individually",
    className: "text-xl font-semibold",
  },
}

export const WithDelay: Story = {
  args: {
    text: "Delayed Rolling",
    className: "text-2xl font-bold",
    delay: 1000,
  },
}

export const SingleWord: Story = {
  args: {
    text: "Hello",
    className: "text-5xl font-black tracking-tight",
  },
}
