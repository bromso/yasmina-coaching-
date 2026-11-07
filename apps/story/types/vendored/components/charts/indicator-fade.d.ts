export type IndicatorFadeEdges = "both" | "none" | "top" | "bottom";
export interface VerticalFadeSides {
    top: boolean;
    bottom: boolean;
    any: boolean;
}
export declare function resolveVerticalFadeSides(fade: IndicatorFadeEdges | boolean): VerticalFadeSides;
export interface IndicatorFadeGradientStop {
    offset: string;
    opacity: number;
}
/** Opacity stops for the crosshair vertical gradient. */
export declare function indicatorFadeGradientStops(sides: VerticalFadeSides, fadeLengthPercent?: number): IndicatorFadeGradientStop[];
