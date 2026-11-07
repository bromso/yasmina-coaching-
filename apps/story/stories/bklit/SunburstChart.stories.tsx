import {
  buildArcs,
  SunburstBreadcrumb,
  SunburstCenter,
  SunburstChart,
  SunburstHint,
  SunburstLabels,
  SunburstSegment,
  useSunburstBreadcrumbItems,
} from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

function Breadcrumb() {
  const { items, zoomTo } = useSunburstBreadcrumbItems()
  return (
    <SunburstBreadcrumb className="flex items-center gap-1 text-muted-foreground text-sm">
      {items.map((item, i) => (
        <span className="flex items-center gap-1" key={item.id}>
          {i > 0 ? <span aria-hidden>/</span> : null}
          <button
            className={item.isCurrent ? "font-medium text-foreground" : "hover:text-foreground"}
            onClick={() => zoomTo(item.id)}
            type="button"
          >
            {item.label}
          </button>
        </span>
      ))}
    </SunburstBreadcrumb>
  )
}

const data = {
  name: "Revenue",
  children: [
    {
      name: "Product",
      children: [
        { name: "Enterprise", value: 198 },
        { name: "Pro", value: 145 },
        { name: "Starter", value: 95 },
      ],
    },
    {
      name: "Services",
      children: [
        { name: "Consulting", value: 160 },
        { name: "Support", value: 90 },
        { name: "Training", value: 55 },
      ],
    },
    {
      name: "Partners",
      children: [
        { name: "Referrals", value: 120 },
        { name: "Affiliates", value: 75 },
      ],
    },
  ],
}

const { arcs } = buildArcs(data)

const meta = {
  title: "Bklit/Charts/SunburstChart",
  component: SunburstChart,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "range", min: 200, max: 560, step: 20 },
    },
  },
  args: {
    // Every story supplies its own JSX children; this only satisfies the required prop.
    children: null,
    data,
    size: 360,
  },
} satisfies Meta<typeof SunburstChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <SunburstChart {...args}>
      {arcs.map((arc) => (
        <SunburstSegment index={arc.arcIndex} key={arc.id} />
      ))}
      <SunburstCenter />
      <SunburstLabels />
      <SunburstHint />
    </SunburstChart>
  ),
}

export const WithBreadcrumb: Story = {
  render: (args) => (
    <div className="flex flex-col items-center gap-4">
      <SunburstChart {...args}>
        {arcs.map((arc) => (
          <SunburstSegment index={arc.arcIndex} key={arc.id} />
        ))}
        <SunburstCenter />
        <SunburstLabels />
        <Breadcrumb />
      </SunburstChart>
    </div>
  ),
}
