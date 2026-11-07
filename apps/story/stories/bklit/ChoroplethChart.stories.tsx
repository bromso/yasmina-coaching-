import {
  ChoroplethChart,
  type ChoroplethFeature,
  ChoroplethFeatureComponent,
  ChoroplethGraticule,
  ChoroplethTooltip,
} from "@repo/ui/components/charts"
import { useWorldDataStandalone } from "@repo/ui/components/charts/use-world-data"
import type { Meta, StoryObj } from "@storybook/react-vite"

// The world topology is fetched from GitHub at runtime, the same way bklit's
// own stat-card block does. These stories need network access.
const visitors: Record<string, number> = {
  "United States": 1200,
  Canada: 450,
  "United Kingdom": 620,
  Germany: 540,
  France: 380,
  Brazil: 290,
  India: 810,
  Australia: 260,
  Japan: 330,
  Sweden: 210,
}

const max = Math.max(...Object.values(visitors))

function getValue(feature: ChoroplethFeature) {
  return visitors[feature.properties.name ?? ""] ?? 0
}

function getColor(feature: ChoroplethFeature) {
  const value = getValue(feature)
  if (value === 0) return "var(--chart-scale-01)"
  const step = Math.min(5, Math.max(2, Math.ceil((value / max) * 5)))
  return `var(--chart-scale-0${step})`
}

function WorldMap(props: { zoomEnabled?: boolean; graticule?: boolean }) {
  const { worldData, isLoading } = useWorldDataStandalone()
  if (isLoading || !worldData) {
    return (
      <div className="flex h-[360px] w-[720px] max-w-full items-center justify-center text-muted-foreground text-sm">
        Loading world map…
      </div>
    )
  }
  return (
    <div className="w-[720px] max-w-full">
      <ChoroplethChart aspectRatio="2 / 1" data={worldData} zoomEnabled={props.zoomEnabled}>
        {props.graticule ? <ChoroplethGraticule /> : null}
        <ChoroplethFeatureComponent getFeatureColor={getColor} />
        <ChoroplethTooltip getFeatureValue={getValue} valueLabel="Visitors" />
      </ChoroplethChart>
    </div>
  )
}

const meta = {
  title: "Bklit/Charts/ChoroplethChart",
  component: WorldMap,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    zoomEnabled: { control: { type: "boolean" }, description: "Enable scroll zoom and drag pan" },
    graticule: { control: { type: "boolean" }, description: "Draw the lat/long grid" },
  },
  args: {
    zoomEnabled: false,
    graticule: false,
  },
} satisfies Meta<typeof WorldMap>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ZoomableWithGraticule: Story = {
  args: {
    graticule: true,
    zoomEnabled: true,
  },
}
