import {
  ChartTooltip,
  LiveLine,
  LiveLineChart,
  LiveXAxis,
  LiveYAxis,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"

interface Point {
  time: number
  value: number
}

function seed(count: number): Point[] {
  const now = Date.now() / 1000
  return Array.from({ length: count }, (_, i) => ({
    time: now - (count - 1 - i),
    value: 50 + Math.sin(i / 3) * 20,
  }))
}

/** Appends a new point every second so the chart scrolls like a real feed. */
function LiveDemo(props: { window: number; exaggerate: boolean; paused: boolean }) {
  const [data, setData] = useState<Point[]>(() => seed(40))

  useEffect(() => {
    if (props.paused) return
    const id = window.setInterval(() => {
      setData((prev) => {
        const last = prev[prev.length - 1]?.value ?? 50
        const next = Math.max(0, Math.min(100, last + (Math.random() - 0.5) * 12))
        return [...prev.slice(-120), { time: Date.now() / 1000, value: next }]
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [props.paused])

  const latest = data[data.length - 1]?.value ?? 0

  return (
    <div className="w-[720px] max-w-full">
      <LiveLineChart
        data={data}
        exaggerate={props.exaggerate}
        paused={props.paused}
        value={latest}
        window={props.window}
      >
        <LiveLine dataKey="value" stroke="var(--chart-line-primary)" />
        <LiveXAxis />
        <LiveYAxis />
        <ChartTooltip />
      </LiveLineChart>
    </div>
  )
}

const meta = {
  title: "Bklit/Charts/LiveLineChart",
  component: LiveLineChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    window: {
      control: { type: "range", min: 10, max: 120, step: 5 },
      description: "Visible time window in seconds",
    },
    exaggerate: {
      control: { type: "boolean" },
      description: "Tight Y-axis around the visible values",
    },
    paused: {
      control: { type: "boolean" },
      description: "Freeze the feed and the scrolling",
    },
  },
  args: {
    // The demo wrapper owns data and value; these only satisfy the required props.
    data: [],
    value: 0,
    children: null,
    window: 30,
    exaggerate: false,
    paused: false,
  },
} satisfies Meta<typeof LiveLineChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <LiveDemo
      exaggerate={args.exaggerate ?? false}
      paused={args.paused ?? false}
      window={args.window ?? 30}
    />
  ),
}

export const Exaggerated: Story = {
  args: {
    exaggerate: true,
  },
  render: (args) => (
    <LiveDemo
      exaggerate={args.exaggerate ?? false}
      paused={args.paused ?? false}
      window={args.window ?? 30}
    />
  ),
}
