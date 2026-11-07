import type { ReactNode } from "react";
export declare const PATTERN_PRESET_IDS: readonly ["none", "diagonal", "horizontal", "vertical", "cross", "dots", "circles", "accent"];
export type PatternPresetId = (typeof PATTERN_PRESET_IDS)[number];
export interface PatternPresetOptions {
    color?: string;
    scale?: number;
    strokeWidth?: number;
    radius?: number;
    complement?: boolean;
    fill?: string;
    /** Dot grid only — when false, render hollow dots (stroke only). Default: true */
    dotFill?: boolean;
    tileBackground?: string;
}
/** Presets rendered with @visx/pattern `PatternCircles`. */
export declare function isCirclePattern(preset: PatternPresetId): boolean;
/** @deprecated Use `isCirclePattern`. */
export declare function isCirclesPattern(preset: PatternPresetId): boolean;
export declare function patternPresetTileSize(preset: PatternPresetId, scale?: number): {
    width: number;
    height: number;
    strokeWidth: number;
};
/** Renders a @visx/pattern definition node for the given preset. */
export declare function renderPatternPreset(preset: PatternPresetId, id: string, options?: PatternPresetOptions): ReactNode;
