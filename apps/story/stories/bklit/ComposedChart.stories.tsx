import {
  Area,
  ChartTooltip,
  ComposedChart,
  Grid,
  Line,
  SeriesBar,
  XAxis,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const chartData = [
  { date: new Date("2024-01-01"), revenue: 4200, runRate: 3800 },
  { date: new Date("2024-02-01"), revenue: 5100, runRate: 4600 },
  { date: new Date("2024-03-01"), revenue: 4800, runRate: 5200 },
  { date: new Date("2024-04-01"), revenue: 5500, runRate: 5000 },
  { date: new Date("2024-05-01"), revenue: 6100, runRate: 5600 },
  { date: new Date("2024-06-01"), revenue: 5900, runRate: 6000 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/ComposedChart",
  component: ComposedChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: chartData,
  },
} satisfies Meta<typeof ComposedChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <ComposedChart {...args}>
        <Grid horizontal />
        <SeriesBar dataKey="revenue" fill="var(--chart-1)" />
        <Area dataKey="runRate" fill="var(--chart-4)" fillOpacity={0.35} />
        <Line dataKey="runRate" stroke="var(--chart-2)" />
        <XAxis />
        <ChartTooltip />
      </ComposedChart>
    </Frame>
  ),
}
