import type { SankeyLink as SankeyLinkType, SankeyNode as SankeyNodeType } from "d3-sankey";
import { type SankeyLinkDatum, type SankeyNodeDatum } from "./sankey-context";
export interface SankeyLinkProps {
    /** Stroke color for links (overrides gradient). Default: uses gradient */
    stroke?: string;
    /** Stroke opacity. Default: 0.5 */
    strokeOpacity?: number;
    /** Opacity when another link/node is hovered. Default: 0.1 */
    fadedOpacity?: number;
    /** Use gradient from source to target color. Default: true */
    useGradient?: boolean;
    /** Custom function to get node color (for gradient) */
    getNodeColor?: (node: SankeyNodeType<SankeyNodeDatum, SankeyLinkDatum>, index: number) => string;
    /** Custom link color function (overrides gradient) */
    getLinkColor?: (link: SankeyLinkType<SankeyNodeDatum, SankeyLinkDatum>, index: number) => string;
    /** Pattern definitions to render in defs. Use @visx/pattern components (PatternLines, PatternCircles, etc.) */
    patterns?: React.ReactNode;
    /** Return pattern ID for a link, or null/undefined to use gradient/solid color */
    getLinkPattern?: (link: SankeyLinkType<SankeyNodeDatum, SankeyLinkDatum>, index: number) => string | null | undefined;
}
export declare function SankeyLink({ stroke, strokeOpacity, fadedOpacity, useGradient, getNodeColor, getLinkColor, patterns, getLinkPattern, }: SankeyLinkProps): import("react").JSX.Element;
export declare namespace SankeyLink {
    var displayName: string;
}
export default SankeyLink;
