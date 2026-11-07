import { Bar, BarChart, BarXAxis, ChartTooltip, Grid } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const data = [
  { month: "Jan", revenue: 12000, profit: 4500 },
  { month: "Feb", revenue: 15500, profit: 5200 },
  { month: "Mar", revenue: 11000, profit: 3800 },
  { month: "Apr", revenue: 18500, profit: 7100 },
  { month: "May", revenue: 16800, profit: 5400 },
  { month: "Jun", revenue: 21200, profit: 8800 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/BarChart",
  component: BarChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    data,
    xDataKey: "month",
  },
} satisfies Meta<typeof BarChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <BarChart {...args}>
        <Grid horizontal />
        <Bar dataKey="revenue" fill="var(--chart-line-primary)" lineCap="round" />
        <Bar dataKey="profit" fill="var(--chart-line-secondary)" lineCap="round" />
        <BarXAxis />
        <ChartTooltip />
      </BarChart>
    </Frame>
  ),
}

export const SingleSeries: Story = {
  render: (args) => (
    <Frame>
      <BarChart {...args}>
        <Grid horizontal />
        <Bar dataKey="revenue" fill="var(--chart-1)" />
        <BarXAxis />
        <ChartTooltip />
      </BarChart>
    </Frame>
  ),
}
