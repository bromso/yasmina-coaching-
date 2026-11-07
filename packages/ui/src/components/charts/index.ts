// Public barrel for the vendored bklit chart registry (https://bklit.com).
// Every chart, block, and supporting helper is exported from here so apps can
// `import { ... } from "@repo/ui/components/charts"`.

export { LinearGradient } from "@visx/gradient"
export { Area } from "./area"
// Core primitives
export { AreaChart } from "./area-chart"
export { Background } from "./background"
export { Bar } from "./bar"
// Bar
export { BarChart } from "./bar-chart"
export { BarXAxis } from "./bar-x-axis"
export { BarYAxis } from "./bar-y-axis"
// Blocks (bklit KPI stat cards)
export { StatCardArea } from "./blocks/stat-card-area"
export { StatCardChoropleth } from "./blocks/stat-card-choropleth"
export { StatCardLine } from "./blocks/stat-card-line"
export { TrendBadge } from "./blocks/trend-badge"
export { Candlestick } from "./candlestick"
// Candlestick
export { CandlestickChart } from "./candlestick-chart"
export { ChartProvider, useChart, useChartHover, useChartStable, useYScale } from "./chart-context"
export { ChartStatFlow } from "./chart-stat-flow"
// Sub-packages
export * from "./choropleth"
export { ComposedChart } from "./composed-chart"
export { FunnelChart } from "./funnel-chart"
export { Gauge } from "./gauge"
export { Grid } from "./grid"
export * from "./heatmap"
export * from "./legend"
export { Line } from "./line"
// Line / composed / scatter
export { LineChart } from "./line-chart"
export { LiveLine } from "./live-line"
// Live
export { LiveLineChart } from "./live-line-chart"
export { LiveXAxis } from "./live-x-axis"
export { LiveYAxis } from "./live-y-axis"
export { PieCenter } from "./pie-center"

// Pie / ring / radar / gauge / funnel
export { PieChart } from "./pie-chart"
export { PieSlice } from "./pie-slice"
export {
  PROFIT_LOSS_LEGEND_ITEMS,
  ProfitLossLegend,
  type ProfitLossLegendProps,
} from "./profit-loss-legend"
// Profit / loss
export {
  PROFIT_LOSS_NEGATIVE_COLOR,
  PROFIT_LOSS_POSITIVE_COLOR,
  PROFIT_LOSS_TOOLTIP_LABEL_FALLBACK,
  ProfitLossLine,
  type ProfitLossLineProps,
  profitLossColor,
  resolveProfitLossTooltipLabel,
} from "./profit-loss-line"
export { ProjectionLine } from "./projection-line"
export { RadarArea } from "./radar-area"
export { RadarAxis } from "./radar-axis"
export { RadarChart } from "./radar-chart"
export { RadarGrid } from "./radar-grid"
export { RadarLabels } from "./radar-labels"
export { Ring } from "./ring"
export { RingCenter } from "./ring-center"
export { RingChart } from "./ring-chart"
export {
  SankeyChart,
  type SankeyChartProps,
  type SankeyContextValue,
  type SankeyData,
  type SankeyLabelOrientation,
  SankeyLink,
  type SankeyLinkDatum,
  type SankeyLinkProps,
  SankeyNode,
  type SankeyNodeDatum,
  type SankeyNodeProps,
  SankeyProvider,
  SankeyTooltip,
  type SankeyTooltipData,
  type SankeyTooltipProps,
  sankeyCssVars,
  useSankey,
} from "./sankey"
export { Scatter } from "./scatter"
export { ScatterChart } from "./scatter-chart"
export { SeriesBar } from "./series-bar"
export { SeriesMarkers } from "./series-markers"
export { ShimmeringText } from "./shimmering-text"
// Sunburst
export { buildArcs } from "./sunburst"
export { SunburstBreadcrumb, useSunburstBreadcrumbItems } from "./sunburst-breadcrumb"
export { SunburstCenter } from "./sunburst-center"
export { SunburstChart } from "./sunburst-chart"
export type { SunburstNode } from "./sunburst-data"
export { SunburstHint } from "./sunburst-hint"
export { SunburstLabels } from "./sunburst-labels"
export { SunburstSegment } from "./sunburst-segment"
export * from "./tooltip"
export { XAxis } from "./x-axis"
export { YAxis } from "./y-axis"
