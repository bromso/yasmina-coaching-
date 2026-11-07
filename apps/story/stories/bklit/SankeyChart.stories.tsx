import { SankeyChart, SankeyLink, SankeyNode, SankeyTooltip } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"

const data = {
  nodes: [
    { name: "Ads" },
    { name: "Organic" },
    { name: "Landing" },
    { name: "Product" },
    { name: "Checkout" },
  ],
  links: [
    { source: 0, target: 2, value: 40 },
    { source: 1, target: 2, value: 30 },
    { source: 2, target: 3, value: 50 },
    { source: 3, target: 4, value: 35 },
  ],
}

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-[720px] max-w-full">{children}</div>
)

const meta = {
  title: "Bklit/Charts/SankeyChart",
  component: SankeyChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data,
    aspectRatio: "16 / 9",
  },
} satisfies Meta<typeof SankeyChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <Frame>
      <SankeyChart {...args}>
        <SankeyLink />
        <SankeyNode />
        <SankeyTooltip />
      </SankeyChart>
    </Frame>
  ),
}
