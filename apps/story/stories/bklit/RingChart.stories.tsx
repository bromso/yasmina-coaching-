import { Ring, RingCenter, RingChart } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

const ringData = [
  { label: "Email", value: 42, maxValue: 100 },
  { label: "Social", value: 28, maxValue: 100 },
  { label: "Direct", value: 18, maxValue: 100 },
  { label: "Other", value: 12, maxValue: 100 },
]

const meta = {
  title: "Bklit/Charts/RingChart",
  component: RingChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "range", min: 120, max: 480, step: 20 },
    },
    strokeWidth: {
      control: { type: "range", min: 4, max: 40, step: 2 },
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data: ringData,
    size: 280,
    strokeWidth: 14,
  },
} satisfies Meta<typeof RingChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <RingChart {...args}>
      {ringData.map((item, i) => (
        <Ring index={i} key={item.label} />
      ))}
      <RingCenter defaultLabel="Channels" />
    </RingChart>
  ),
}
