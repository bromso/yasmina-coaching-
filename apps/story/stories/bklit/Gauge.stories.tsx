import { Gauge } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Bklit/Charts/Gauge",
  component: Gauge,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
      description: "Filled portion of the gauge, 0 to 100",
    },
    totalNotches: {
      control: { type: "range", min: 8, max: 80, step: 4 },
    },
    orientation: {
      control: { type: "select" },
      options: ["arc", "linear"],
    },
  },
  args: {
    value: 72,
    centerValue: 72,
    totalNotches: 40,
    defaultLabel: "Score",
    suffix: "%",
  },
} satisfies Meta<typeof Gauge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Low: Story = {
  args: {
    value: 18,
    centerValue: 18,
    defaultLabel: "Utilisation",
  },
}
