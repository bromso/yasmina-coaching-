import { FunnelChart } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const funnelData = [
  { label: "Visitors", value: 12000 },
  { label: "Signups", value: 4800 },
  { label: "Activated", value: 2100 },
  { label: "Paid", value: 840 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/FunnelChart",
  component: FunnelChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: { type: "select" },
      options: ["horizontal", "vertical"],
    },
    edges: {
      control: { type: "select" },
      options: ["curved", "straight"],
    },
    showPercentage: { control: { type: "boolean" } },
    showValues: { control: { type: "boolean" } },
    showLabels: { control: { type: "boolean" } },
  },
  args: {
    data: funnelData,
  },
} satisfies Meta<typeof FunnelChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <FunnelChart {...args} />
    </Frame>
  ),
}

export const Vertical: Story = {
  args: {
    orientation: "vertical",
  },
  render: (args) => (
    <div className="w-[420px] max-w-full">
      <FunnelChart {...args} />
    </div>
  ),
}
