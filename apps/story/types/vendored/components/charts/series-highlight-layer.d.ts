import type { RefObject } from "react";
interface SeriesHighlightLayerProps {
    /** Caller already gated `showHighlight && showLine`; this just routes through. */
    enabled: boolean;
    height: number;
    pathRef: RefObject<SVGPathElement | null>;
    stroke: string;
    strokeWidth: number;
}
/**
 * Self-contained hover-highlight band over a series stroke.
 *
 * Owns the `useHighlightSegment` subscription (which reads both stable + hover
 * context) so the parent <Area> / <Line> can stay on the stable slice. This
 * component still re-renders on hover — that's the price of driving the
 * highlight band — but it's a tiny leaf so the cost is bounded to itself.
 */
export declare function SeriesHighlightLayer({ enabled, height, pathRef, stroke, strokeWidth, }: SeriesHighlightLayerProps): import("react").JSX.Element;
export declare namespace SeriesHighlightLayer {
    var displayName: string;
}
export default SeriesHighlightLayer;
