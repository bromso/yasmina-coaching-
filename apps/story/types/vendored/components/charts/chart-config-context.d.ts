import { type ReactNode } from "react";
export interface SpringConfig {
    stiffness: number;
    damping: number;
}
export interface ChartConfigValue {
    /** Crosshair indicator, tooltip dot, date pill. */
    tooltipSpring: SpringConfig;
    /** Floating tooltip panel. */
    tooltipBoxSpring: SpringConfig;
    /** Line/area hover-highlight band (x + width). */
    highlightSpring: SpringConfig;
}
export declare const DEFAULT_CHART_CONFIG: ChartConfigValue;
export interface ChartConfigProviderProps {
    value?: Partial<ChartConfigValue>;
    children: ReactNode;
}
export declare function ChartConfigProvider({ value, children }: ChartConfigProviderProps): import("react").JSX.Element;
export declare function useChartConfig(): ChartConfigValue;
/** Maps a damping slider to the floating tooltip panel follow spring. `0` = instant. */
export declare function resolveTooltipBoxMotion(damping?: number): {
    animate: boolean;
    springConfig: SpringConfig;
};
