import { ChartTooltip, Grid, Scatter, ScatterChart, XAxis } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const chartData = [
  { date: new Date("2024-01-01"), sessions: 420, conversions: 28 },
  { date: new Date("2024-02-01"), sessions: 510, conversions: 34 },
  { date: new Date("2024-03-01"), sessions: 390, conversions: 22 },
  { date: new Date("2024-04-01"), sessions: 580, conversions: 41 },
  { date: new Date("2024-05-01"), sessions: 620, conversions: 38 },
  { date: new Date("2024-06-01"), sessions: 710, conversions: 52 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/ScatterChart",
  component: ScatterChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: chartData,
  },
} satisfies Meta<typeof ScatterChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <ScatterChart {...args}>
        <Grid horizontal />
        <Scatter dataKey="sessions" />
        <Scatter dataKey="conversions" />
        <XAxis />
        <ChartTooltip />
      </ScatterChart>
    </Frame>
  ),
}
