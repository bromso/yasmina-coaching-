import { Area, AreaChart, ChartTooltip, Grid, XAxis } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const chartData = [
  { date: new Date("2024-01-01"), desktop: 186, mobile: 80 },
  { date: new Date("2024-02-01"), desktop: 305, mobile: 200 },
  { date: new Date("2024-03-01"), desktop: 237, mobile: 120 },
  { date: new Date("2024-04-01"), desktop: 73, mobile: 190 },
  { date: new Date("2024-05-01"), desktop: 209, mobile: 130 },
  { date: new Date("2024-06-01"), desktop: 214, mobile: 140 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/AreaChart",
  component: AreaChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    animationDuration: {
      control: { type: "range", min: 0, max: 3000, step: 100 },
      description: "Enter animation duration in milliseconds",
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: chartData,
    animationDuration: 1100,
  },
} satisfies Meta<typeof AreaChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <AreaChart {...args}>
        <Grid horizontal />
        <Area dataKey="desktop" strokeWidth={2.5} fillOpacity={0.4} />
        <XAxis />
        <ChartTooltip />
      </AreaChart>
    </Frame>
  ),
}

export const TwoSeries: Story = {
  render: (args) => (
    <Frame>
      <AreaChart {...args}>
        <Grid horizontal />
        <Area dataKey="desktop" fill="var(--chart-line-primary)" fillOpacity={0.35} />
        <Area dataKey="mobile" fill="var(--chart-line-secondary)" fillOpacity={0.35} />
        <XAxis />
        <ChartTooltip />
      </AreaChart>
    </Frame>
  ),
}
