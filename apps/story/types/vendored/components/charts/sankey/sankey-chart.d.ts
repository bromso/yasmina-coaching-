import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type Margin, type SankeyLinkDatum, type SankeyNodeDatum } from "./sankey-context";
export interface SankeyData {
    nodes: SankeyNodeDatum[];
    links: SankeyLinkDatum[];
}
export interface SankeyChartProps {
    /** Sankey data with nodes and links */
    data: SankeyData;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Animation duration in milliseconds. Default: 1100 */
    animationDuration?: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers enter replay when it changes. */
    revealSignature?: string;
    /** Aspect ratio as "width / height". Default: "2 / 1" */
    aspectRatio?: string;
    /** Node width in pixels. Default: 16 */
    nodeWidth?: number;
    /** Node padding in pixels. Default: 24 */
    nodePadding?: number;
    /** Additional class name for the container */
    className?: string;
    /** Child components (SankeyNode, SankeyLink, SankeyTooltip) */
    children: ReactNode;
    /** Controlled hovered node index (e.g. from ChartLegend). */
    hoveredNodeIndex?: number | null;
    /** Called when node hover changes from the chart surface. */
    onNodeHoverChange?: (index: number | null) => void;
}
export declare function SankeyChart({ data, margin: marginProp, animationDuration, enterTransition, revealSignature, aspectRatio, nodeWidth, nodePadding, className, children, hoveredNodeIndex, onNodeHoverChange, }: SankeyChartProps): import("react").JSX.Element;
export declare namespace SankeyChart {
    var displayName: string;
}
export default SankeyChart;
