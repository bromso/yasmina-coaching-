import { PulsatingButton } from "@repo/ui/components/pulsating-button"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Buttons/PulsatingButton",
  component: PulsatingButton,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    pulseColor: {
      control: "color",
      description: "Color of the pulsating ring effect",
    },
    duration: {
      control: "text",
      description: "Duration of the pulse animation (CSS time value)",
    },
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof PulsatingButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: "Pulsating Button",
  },
}

export const CustomPulseColor: Story = {
  args: {
    children: "Blue Pulse",
    pulseColor: "#3B82F6",
  },
}

export const SlowPulse: Story = {
  args: {
    children: "Slow Pulse",
    duration: "3s",
    pulseColor: "#10B981",
  },
}

export const FastPulse: Story = {
  args: {
    children: "Fast Pulse",
    duration: "0.5s",
    pulseColor: "#EF4444",
  },
}

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
}
