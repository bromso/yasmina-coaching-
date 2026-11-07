import type { SankeyNode as SankeyNodeType } from "d3-sankey";
import { type SankeyLinkDatum, type SankeyNodeDatum } from "./sankey-context";
export type SankeyLabelOrientation = "horizontal" | "vertical";
export interface SankeyNodeProps {
    /** Fill color for nodes. Default: uses theme colors */
    fill?: string;
    /** Corner radius for nodes. Default: 4 */
    lineCap?: number;
    /** Opacity when another node/link is hovered. Default: 0.4 */
    fadedOpacity?: number;
    /** Show node labels. Default: true */
    showLabels?: boolean;
    /** Show value labels under node names. Default: true */
    showValueLabels?: boolean;
    /**
     * Label reading direction for outside node labels.
     * - "horizontal": labels sit left/right of nodes (default).
     * - "vertical": labels rotate 90° and read along the node edge.
     */
    labelOrientation?: SankeyLabelOrientation;
    /** Custom node color function */
    getNodeColor?: (node: SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum>, index: number) => string;
}
export declare function SankeyNode({ fill, lineCap, fadedOpacity, showLabels, showValueLabels, labelOrientation, getNodeColor: getNodeColorProp, }: SankeyNodeProps): import("react").JSX.Element;
export declare namespace SankeyNode {
    var displayName: string;
}
export default SankeyNode;
