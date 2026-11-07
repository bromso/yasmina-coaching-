import {
  RadarArea,
  RadarAxis,
  RadarChart,
  RadarGrid,
  RadarLabels,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

const metrics = [
  { key: "speed", label: "Speed" },
  { key: "reliability", label: "Reliability" },
  { key: "comfort", label: "Comfort" },
  { key: "safety", label: "Safety" },
  { key: "efficiency", label: "Efficiency" },
]

const data = [
  {
    label: "Model A",
    values: { speed: 80, reliability: 70, comfort: 60, safety: 90, efficiency: 75 },
  },
  {
    label: "Model B",
    values: { speed: 55, reliability: 85, comfort: 80, safety: 65, efficiency: 60 },
  },
]

const meta = {
  title: "Bklit/Charts/RadarChart",
  component: RadarChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "range", min: 160, max: 520, step: 20 },
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: data.slice(0, 1),
    metrics,
    size: 320,
  },
} satisfies Meta<typeof RadarChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <RadarChart {...args}>
      <RadarGrid />
      <RadarAxis />
      <RadarLabels fontSize={10} offset={16} />
      <RadarArea index={0} color="var(--chart-line-primary)" />
    </RadarChart>
  ),
}

export const TwoSeries: Story = {
  args: {
    data,
  },
  render: (args) => (
    <RadarChart {...args}>
      <RadarGrid />
      <RadarAxis />
      <RadarLabels fontSize={10} offset={16} />
      <RadarArea index={0} color="var(--chart-line-primary)" />
      <RadarArea index={1} color="var(--chart-line-secondary)" />
    </RadarChart>
  ),
}
