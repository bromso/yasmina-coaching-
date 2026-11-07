import type { PatternPresetId } from "../pattern-preset";
/** Default Less → More scale using {@link CHART_SCALE_VARS}. */
export declare const HEATMAP_DEFAULT_LEVEL_COLORS: readonly ["var(--chart-scale-01)", "var(--chart-scale-02)", "var(--chart-scale-03)", "var(--chart-scale-04)", "var(--chart-scale-05)"];
export type HeatmapLevelColors = readonly [string, string, string, string, string];
export type HeatmapLevelFillMode = "solid" | "pattern";
export interface HeatmapLevelStyle {
    color: string;
    fillMode?: HeatmapLevelFillMode;
    pattern?: PatternPresetId;
    patternColor?: string;
    patternScale?: number;
    patternStrokeWidth?: number;
    patternRadius?: number;
    patternComplement?: boolean;
    patternFill?: string;
    patternTileBackground?: string;
    patternOpacity?: number;
    patternDotsFill?: boolean;
}
export type HeatmapLevelStyles = readonly [
    HeatmapLevelStyle,
    HeatmapLevelStyle,
    HeatmapLevelStyle,
    HeatmapLevelStyle,
    HeatmapLevelStyle
];
export declare const HEATMAP_DEFAULT_LEVEL_STYLES: readonly [{
    readonly color: "var(--chart-scale-01)";
    readonly fillMode: "solid";
    readonly pattern: "none";
}, {
    readonly color: "var(--chart-scale-02)";
    readonly fillMode: "solid";
    readonly pattern: "none";
}, {
    readonly color: "var(--chart-scale-03)";
    readonly fillMode: "solid";
    readonly pattern: "none";
}, {
    readonly color: "var(--chart-scale-04)";
    readonly fillMode: "solid";
    readonly pattern: "none";
}, {
    readonly color: "var(--chart-scale-05)";
    readonly fillMode: "solid";
    readonly pattern: "none";
}];
export declare function heatmapLevelPatternId(level: number): string;
export declare function isHeatmapLevelPattern(style: HeatmapLevelStyle): boolean;
export declare function heatmapPatternStrokeFallback(color: string): string;
export declare function heatmapLevelPatternRenderOptions(style: HeatmapLevelStyle): {
    color: string;
    tileBackground: string;
    scale: number;
    strokeWidth: number | undefined;
    radius: number | undefined;
    complement: boolean | undefined;
    fill: string | undefined;
    dotFill: boolean | undefined;
};
export declare function heatmapLevelCellFillOpacity(style: HeatmapLevelStyle): number;
export declare function levelColorsFromStyles(levelStyles: HeatmapLevelStyles): HeatmapLevelColors;
export declare function levelStylesFromColors(levelColors: HeatmapLevelColors): HeatmapLevelStyles;
export declare function resolveHeatmapLevelStyles(levelColors?: HeatmapLevelColors, levelStyles?: HeatmapLevelStyles): HeatmapLevelStyles;
export declare function buildHeatmapColorScale(levelColors: HeatmapLevelColors): (count: number | null | undefined) => string;
export declare function buildHeatmapColorScaleFromStyles(levelStyles: HeatmapLevelStyles): (count: number | null | undefined) => string;
export declare function buildHeatmapFillScale(levelStyles: HeatmapLevelStyles): (count: number | null | undefined) => string;
export declare const defaultHeatmapColorScale: (count: number | null | undefined) => string;
export declare const defaultHeatmapFillScale: (count: number | null | undefined) => string;
