import { PieCenter, PieChart, PieSlice } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

const pieData = [
  { label: "Direct", value: 320 },
  { label: "Organic", value: 280 },
  { label: "Referral", value: 190 },
  { label: "Social", value: 140 },
]

const meta = {
  title: "Bklit/Charts/PieChart",
  component: PieChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "range", min: 120, max: 480, step: 20 },
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: pieData,
    size: 280,
  },
} satisfies Meta<typeof PieChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <PieChart {...args}>
      {pieData.map((item, i) => (
        <PieSlice index={i} key={item.label} />
      ))}
      <PieCenter defaultLabel="Traffic" />
    </PieChart>
  ),
}
