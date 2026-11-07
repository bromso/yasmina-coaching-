import {
  ChartTooltip,
  Grid,
  Line,
  LineChart,
  ProfitLossLegend,
  ProfitLossLine,
  profitLossColor,
  resolveProfitLossTooltipLabel,
  XAxis,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const data = [
  { date: new Date("2024-01-01"), pnl: 420 },
  { date: new Date("2024-01-02"), pnl: -180 },
  { date: new Date("2024-01-03"), pnl: 260 },
  { date: new Date("2024-01-04"), pnl: 610 },
  { date: new Date("2024-01-05"), pnl: -340 },
  { date: new Date("2024-01-06"), pnl: -90 },
  { date: new Date("2024-01-07"), pnl: 150 },
  { date: new Date("2024-01-08"), pnl: 480 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/ProfitLossLine",
  component: ProfitLossLine,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    strokeWidth: {
      control: { type: "range", min: 1, max: 6, step: 0.5 },
    },
    positiveColor: { control: { type: "color" } },
    negativeColor: { control: { type: "color" } },
  },
  args: {
    dataKey: "pnl",
    strokeWidth: 2.5,
  },
} satisfies Meta<typeof ProfitLossLine>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <LineChart data={data}>
        <Grid highlightRowValues={[0]} horizontal />
        <Line
          dataKey="pnl"
          fadeEdges={false}
          showHighlight={false}
          stroke="transparent"
          strokeWidth={0}
        />
        <ProfitLossLine {...args} />
        <XAxis />
        <ChartTooltip
          indicatorColor={(point) => profitLossColor((point.pnl as number) ?? 0)}
          rows={(point) => {
            const value = (point.pnl as number) ?? 0
            return [
              {
                color: profitLossColor(value),
                label: resolveProfitLossTooltipLabel(""),
                value,
              },
            ]
          }}
        />
      </LineChart>
    </Frame>
  ),
}

export const WithLegend: Story = {
  render: (args) => (
    <Frame>
      <div className="flex flex-col gap-3">
        <ProfitLossLegend />
        <LineChart data={data}>
          <Grid highlightRowValues={[0]} horizontal />
          <Line
            dataKey="pnl"
            fadeEdges={false}
            showHighlight={false}
            stroke="transparent"
            strokeWidth={0}
          />
          <ProfitLossLine {...args} />
          <XAxis />
          <ChartTooltip />
        </LineChart>
      </div>
    </Frame>
  ),
}
