export interface DashTailStrokeProps {
    /** SVG path `d` for the full series (single curved path). */
    pathD: string | null;
    /** Total length of `pathD` in user units. */
    pathLength: number;
    /** Path length at which the dashed tail begins. */
    dashStartLength: number;
    /** X coordinate (chart inner space) where the tail clip begins. */
    dashStartX: number;
    innerWidth: number;
    innerHeight: number;
    /** Stroke paint — solid color or gradient url. */
    stroke: string;
    strokeWidth: number;
    dashArray: string;
}
export declare function DashTailStroke({ pathD, pathLength, dashStartLength, dashStartX, innerWidth, innerHeight, stroke, strokeWidth, dashArray, }: DashTailStrokeProps): import("react").JSX.Element | null;
