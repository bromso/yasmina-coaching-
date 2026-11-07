import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@repo/ui/components/chart"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Bar, BarChart, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/Data Display/Chart",
  component: ChartContainer,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ChartContainer>

export default meta
// Every story renders its own markup from `render` and takes no args, so stories are not
// bound to the component's required props.
type Story = StoryObj

const barChartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
]

const barChartConfig = {
  desktop: {
    label: "Desktop",
    color: "hsl(var(--chart-1))",
  },
  mobile: {
    label: "Mobile",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export const BarChartExample: Story = {
  render: () => (
    <ChartContainer config={barChartConfig} className="min-h-[200px] w-[500px]">
      <BarChart accessibilityLayer data={barChartData}>
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="desktop" fill="var(--color-desktop)" radius={4} />
        <Bar dataKey="mobile" fill="var(--color-mobile)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Check that the chart container is rendered
    const chartContainer = canvasElement.querySelector("[data-chart]")
    await expect(chartContainer).toBeInTheDocument()

    // Check for legend items
    await expect(canvas.getByText("Desktop")).toBeInTheDocument()
    await expect(canvas.getByText("Mobile")).toBeInTheDocument()
  },
}

const lineChartData = [
  { month: "Jan", revenue: 2400 },
  { month: "Feb", revenue: 1398 },
  { month: "Mar", revenue: 9800 },
  { month: "Apr", revenue: 3908 },
  { month: "May", revenue: 4800 },
  { month: "Jun", revenue: 3800 },
]

const lineChartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

export const LineChartExample: Story = {
  render: () => (
    <ChartContainer config={lineChartConfig} className="min-h-[200px] w-[500px]">
      <LineChart accessibilityLayer data={lineChartData}>
        <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  ),
}

const pieChartData = [
  { browser: "chrome", visitors: 275, fill: "hsl(var(--chart-1))" },
  { browser: "safari", visitors: 200, fill: "hsl(var(--chart-2))" },
  { browser: "firefox", visitors: 187, fill: "hsl(var(--chart-3))" },
  { browser: "edge", visitors: 173, fill: "hsl(var(--chart-4))" },
  { browser: "other", visitors: 90, fill: "hsl(var(--chart-5))" },
]

const pieChartConfig = {
  visitors: {
    label: "Visitors",
  },
  chrome: {
    label: "Chrome",
    color: "hsl(var(--chart-1))",
  },
  safari: {
    label: "Safari",
    color: "hsl(var(--chart-2))",
  },
  firefox: {
    label: "Firefox",
    color: "hsl(var(--chart-3))",
  },
  edge: {
    label: "Edge",
    color: "hsl(var(--chart-4))",
  },
  other: {
    label: "Other",
    color: "hsl(var(--chart-5))",
  },
} satisfies ChartConfig

export const PieChartExample: Story = {
  render: () => (
    <ChartContainer config={pieChartConfig} className="min-h-[250px] w-[300px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={pieChartData} dataKey="visitors" nameKey="browser" innerRadius={60} />
      </PieChart>
    </ChartContainer>
  ),
}
