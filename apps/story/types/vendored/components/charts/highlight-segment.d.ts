import { type MotionValue } from "motion/react";
import { type RefObject } from "react";
export interface HighlightSegmentProps {
    /** Ref to the rendered base stroke `<path>` — its `d` is re-used verbatim. */
    pathRef: RefObject<SVGPathElement | null>;
    /** Whether to render (caller gates on showHighlight + active + loaded). */
    visible: boolean;
    stroke: string;
    strokeWidth: number;
    /** Plot height — the clip band spans it fully. */
    height: number;
    /** Spring-eased left edge of the clip band (px). */
    x: MotionValue<number>;
    /** Spring-eased width of the clip band (px). */
    width: MotionValue<number>;
}
export declare function HighlightSegment({ pathRef, visible, stroke, strokeWidth, height, x, width, }: HighlightSegmentProps): import("react").JSX.Element | null;
export declare namespace HighlightSegment {
    var displayName: string;
}
export default HighlightSegment;
