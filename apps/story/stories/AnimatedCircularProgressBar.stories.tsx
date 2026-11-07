import { AnimatedCircularProgressBar } from "@repo/ui/components/animated-circular-progress-bar"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Text & Animation/AnimatedCircularProgressBar",
  component: AnimatedCircularProgressBar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
    min: {
      control: { type: "number" },
    },
    max: {
      control: { type: "number" },
    },
    gaugePrimaryColor: {
      control: { type: "color" },
    },
    gaugeSecondaryColor: {
      control: { type: "color" },
    },
  },
  args: {
    value: 72,
    gaugePrimaryColor: "#4f46e5",
    gaugeSecondaryColor: "#e5e7eb",
  },
} satisfies Meta<typeof AnimatedCircularProgressBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    value: 0,
  },
}

export const Quarter: Story = {
  args: {
    value: 25,
  },
}

export const Half: Story = {
  args: {
    value: 50,
  },
}

export const Full: Story = {
  args: {
    value: 100,
    gaugePrimaryColor: "#22c55e",
    gaugeSecondaryColor: "#dcfce7",
  },
}

export const CustomRange: Story = {
  args: {
    min: 0,
    max: 200,
    value: 150,
    gaugePrimaryColor: "#f97316",
    gaugeSecondaryColor: "#fed7aa",
  },
}

export const WarningColors: Story = {
  args: {
    value: 85,
    gaugePrimaryColor: "#ef4444",
    gaugeSecondaryColor: "#fecaca",
  },
}
