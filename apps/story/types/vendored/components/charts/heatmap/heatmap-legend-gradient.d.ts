import type { HeatmapLevelStyles } from "./heatmap-colors";
export interface HeatmapLegendGradientProps {
    levels: readonly number[];
    levelStyles: HeatmapLevelStyles;
    cellSize: number;
    gap: number;
    cornerRadius: number;
    gradientSpan: number;
    highlightedLevel: number | null;
    isDimming: boolean;
    inactiveOpacity: number;
    inactiveScale: number;
    activeScale: number;
    isInteractive: boolean;
    onEnter: (level: number) => void;
    onLeave: () => void;
}
export declare const HeatmapLegendGradient: import("react").NamedExoticComponent<HeatmapLegendGradientProps>;
export default HeatmapLegendGradient;
