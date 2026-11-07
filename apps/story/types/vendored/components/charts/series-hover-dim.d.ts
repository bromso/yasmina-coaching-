import type { ReactNode } from "react";
interface SeriesHoverDimProps {
    /** Skip the dim entirely. */
    enabled?: boolean;
    /** Opacity to fade to while the chart is being hovered. */
    dimOpacity?: number;
    /** Tween duration in seconds. */
    durationSec?: number;
    /** Series index for multi-series legend hover dimming. */
    seriesIndex?: number;
    /** Stable chart visuals — area fill, stroke line, dashed tail, etc. */
    children: ReactNode;
}
/**
 * Wraps stable series visuals with a hover-driven opacity animation.
 *
 * The wrapper subscribes to chart hover state internally so the parent (Area /
 * Line) can stay on the stable context slice. Children come in as a React prop:
 * because the parent is not re-rendering on hover, the children element
 * reference stays identical and React skips re-rendering them when this
 * wrapper re-renders. That keeps expensive subtrees (`SeriesDashTailOverlay`
 * and its `getPointAtLength` binary search) quiescent on cursor motion.
 */
export declare function SeriesHoverDim({ enabled, dimOpacity, durationSec, seriesIndex, children, }: SeriesHoverDimProps): import("react").JSX.Element;
export declare namespace SeriesHoverDim {
    var displayName: string;
}
export default SeriesHoverDim;
