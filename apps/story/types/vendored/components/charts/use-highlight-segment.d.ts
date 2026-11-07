import { useSpring } from "motion/react";
export interface HighlightSegmentResult {
    xSpring: ReturnType<typeof useSpring>;
    widthSpring: ReturnType<typeof useSpring>;
    isActive: boolean;
}
/**
 * @param enabled set false when there is no stroke to highlight (e.g. an area
 *   with `showLine={false}`); defaults true.
 */
export declare function useHighlightSegment({ enabled, }?: {
    enabled?: boolean;
}): HighlightSegmentResult;
