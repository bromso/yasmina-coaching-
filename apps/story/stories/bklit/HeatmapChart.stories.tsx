import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

// 26 weeks of pseudo-random daily activity, GitHub-contribution style.
const start = new Date(2024, 0, 1)
const data = Array.from({ length: 26 }, (_, week) => ({
  bin: week,
  bins: Array.from({ length: 7 }, (_, day) => {
    const date = new Date(start)
    date.setDate(start.getDate() + week * 7 + day)
    const seed = (week * 7 + day) * 9301 + 49297
    return { bin: day, count: (seed % 233280) % 6, date }
  }),
}))

const meta = {
  title: "Bklit/Charts/HeatmapChart",
  component: HeatmapChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    layout: {
      control: { type: "select" },
      options: ["fluid", "fixed"],
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data,
    layout: "fluid",
  },
} satisfies Meta<typeof HeatmapChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <HeatmapInteractionProvider>
      <HeatmapInteractionBoundary>
        <div className="flex w-[720px] max-w-full flex-col items-stretch gap-3">
          <HeatmapChart {...args} className="w-full">
            <HeatmapCells />
            <HeatmapXAxis />
            <HeatmapYAxis />
            <HeatmapTooltip />
          </HeatmapChart>
          <HeatmapLegend />
        </div>
      </HeatmapInteractionBoundary>
    </HeatmapInteractionProvider>
  ),
}
