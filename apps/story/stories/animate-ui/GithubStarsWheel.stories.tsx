import { GitHubStarsWheel } from "@repo/ui/components/animate-ui/components/animate/github-stars-wheel"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Animate UI/Animate/GitHubStarsWheel",
  component: GitHubStarsWheel,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "number", min: 0, max: 100000, step: 100 },
      description: "Override star count (bypasses API fetch)",
    },
    step: {
      control: { type: "number", min: 10, max: 1000, step: 10 },
      description: "Rounding step for the displayed number",
    },
    direction: {
      control: "select",
      options: ["btt", "ttb"],
      description: "Scroll direction: bottom-to-top or top-to-bottom",
    },
    delay: {
      control: { type: "number", min: 0, max: 5000, step: 100 },
      description: "Delay in ms before animation starts",
    },
  },
} satisfies Meta<typeof GitHubStarsWheel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    value: 12400,
    step: 100,
  },
}

export const BottomToTop: Story = {
  args: {
    value: 8500,
    step: 100,
    direction: "btt",
  },
}

export const TopToBottom: Story = {
  args: {
    value: 8500,
    step: 100,
    direction: "ttb",
  },
}

export const SmallStep: Story = {
  args: {
    value: 5230,
    step: 10,
  },
}

export const LargeValue: Story = {
  args: {
    value: 98700,
    step: 100,
  },
}
