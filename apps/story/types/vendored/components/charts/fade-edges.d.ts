export type FadeEdges = boolean | "left" | "right";
export interface FadeSides {
    /** Whether the left edge should fade out. */
    left: boolean;
    /** Whether the right edge should fade out. */
    right: boolean;
    /** True if either side fades — use to gate gradient/mask defs. */
    any: boolean;
}
export declare function resolveFadeSides(fade: FadeEdges): FadeSides;
export interface FadeGradientStop {
    offset: string;
    opacity: number;
}
/**
 * Stops for a horizontal fade gradient with opacity 0 at the faded side(s)
 * and opacity 1 in the middle. Matches the historic 0/15/85/100 pattern.
 */
export declare function fadeGradientStops(sides: FadeSides): FadeGradientStop[];
/** Horizontal fade gradient pinned to the chart viewport (not the series path bounds). */
export declare function viewportFadeGradientAttrs(innerWidth: number): {
    gradientUnits: "userSpaceOnUse";
    x1: number;
    x2: number;
    y1: number;
    y2: number;
};
