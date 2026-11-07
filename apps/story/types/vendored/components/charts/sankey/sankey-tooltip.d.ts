import type { SankeyLink, SankeyNode } from "d3-sankey";
import { type SankeyLinkDatum, type SankeyNodeDatum } from "./sankey-context";
export interface SankeyTooltipProps {
    /** Custom content renderer for node tooltips */
    nodeContent?: (props: {
        node: SankeyNode<SankeyNodeDatum, SankeyLinkDatum>;
        index: number;
    }) => React.ReactNode;
    /** Custom content renderer for link tooltips */
    linkContent?: (props: {
        link: SankeyLink<SankeyNodeDatum, SankeyLinkDatum>;
        index: number;
    }) => React.ReactNode;
    /** Value formatter function */
    formatValue?: (value: number) => string;
    /** Custom class name */
    className?: string;
}
export declare function SankeyTooltip({ nodeContent, linkContent, formatValue, className, }: SankeyTooltipProps): import("react").JSX.Element | null;
export declare namespace SankeyTooltip {
    var displayName: string;
}
export default SankeyTooltip;
