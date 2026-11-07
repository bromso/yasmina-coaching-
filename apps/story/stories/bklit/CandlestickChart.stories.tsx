import {
  Candlestick,
  CandlestickChart,
  ChartTooltip,
  Grid,
  XAxis,
  YAxis,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const ohlcData = [
  { date: new Date("2024-01-02"), open: 100, high: 108, low: 98, close: 105 },
  { date: new Date("2024-01-03"), open: 105, high: 110, low: 102, close: 103 },
  { date: new Date("2024-01-04"), open: 103, high: 112, low: 101, close: 110 },
  { date: new Date("2024-01-05"), open: 110, high: 115, low: 107, close: 108 },
  { date: new Date("2024-01-08"), open: 108, high: 111, low: 104, close: 106 },
  { date: new Date("2024-01-09"), open: 106, high: 118, low: 105, close: 117 },
  { date: new Date("2024-01-10"), open: 117, high: 120, low: 112, close: 114 },
  { date: new Date("2024-01-11"), open: 114, high: 116, low: 109, close: 111 },
]

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/CandlestickChart",
  component: CandlestickChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: ohlcData,
  },
} satisfies Meta<typeof CandlestickChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <CandlestickChart {...args}>
        <Grid horizontal vertical />
        <Candlestick />
        <XAxis />
        <YAxis />
        <ChartTooltip />
      </CandlestickChart>
    </Frame>
  ),
}
