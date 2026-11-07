import { ChartTooltip, Grid, Line, LineChart, XAxis } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const chartData = [
  { date: new Date("2024-01-01"), users: 1200, sessions: 1800 },
  { date: new Date("2024-02-01"), users: 1350, sessions: 2100 },
  { date: new Date("2024-03-01"), users: 1100, sessions: 1650 },
  { date: new Date("2024-04-01"), users: 1450, sessions: 2300 },
  { date: new Date("2024-05-01"), users: 1380, sessions: 2050 },
  { date: new Date("2024-06-01"), users: 1520, sessions: 2400 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/LineChart",
  component: LineChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: chartData,
  },
} satisfies Meta<typeof LineChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <LineChart {...args}>
        <Grid horizontal />
        <Line dataKey="users" stroke="var(--chart-line-primary)" />
        <XAxis />
        <ChartTooltip />
      </LineChart>
    </Frame>
  ),
}

export const TwoSeries: Story = {
  render: (args) => (
    <Frame>
      <LineChart {...args}>
        <Grid horizontal />
        <Line dataKey="users" stroke="var(--chart-line-primary)" />
        <Line dataKey="sessions" stroke="var(--chart-line-secondary)" />
        <XAxis />
        <ChartTooltip />
      </LineChart>
    </Frame>
  ),
}
