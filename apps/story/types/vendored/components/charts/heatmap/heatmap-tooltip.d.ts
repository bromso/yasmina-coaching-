export interface HeatmapTooltipProps {
    /** Custom contribution line (bottom section). Default: `N contribution(s)`. */
    formatLabel?: (count: number, date: Date) => string;
    /** Custom class name */
    className?: string;
    /** Inline styles for the tooltip panel (background, blur, etc.). */
    panelStyle?: React.CSSProperties;
    /**
     * Tooltip panel background color (CSS variable or color value).
     * Default: `var(--chart-tooltip-background)`.
     */
    backgroundColor?: string;
    /**
     * Delay before showing the tooltip on first hover (ms).
     * Moving between cells updates immediately once visible.
     */
    showDelay?: number;
    /**
     * Grace period before hiding when the pointer leaves a cell (ms).
     * Helps avoid flicker when moving quickly between adjacent cells.
     */
    hideDelay?: number;
    /**
     * When true, the tooltip appears and disappears instantly with no motion.
     */
    instant?: boolean;
}
export declare const HeatmapTooltip: import("react").NamedExoticComponent<HeatmapTooltipProps>;
export default HeatmapTooltip;
