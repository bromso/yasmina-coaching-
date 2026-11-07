import { type ChoroplethFeature } from "./choropleth-context";
export interface ChoroplethTooltipProps {
    /** Custom content renderer for feature tooltips */
    content?: (props: {
        feature: ChoroplethFeature;
        index: number;
    }) => React.ReactNode;
    /** Value formatter function */
    formatValue?: (value: number) => string;
    /** Get the display name for a feature. Default: uses feature.properties.name */
    getFeatureName?: (feature: ChoroplethFeature, index: number) => string;
    /** Get the value for a feature (for display in tooltip) */
    getFeatureValue?: (feature: ChoroplethFeature, index: number) => number | undefined;
    /** Label for the value row. Default: "Value" */
    valueLabel?: string;
    /** Custom class name */
    className?: string;
    /** Inline styles for the tooltip panel (background, blur, etc.). */
    panelStyle?: React.CSSProperties;
    /**
     * Tooltip panel background color (CSS variable or color value).
     * Default: `var(--chart-tooltip-background)`.
     */
    backgroundColor?: string;
}
export declare function ChoroplethTooltip({ content, formatValue, getFeatureName, getFeatureValue, valueLabel, className, panelStyle, backgroundColor, }: ChoroplethTooltipProps): import("react").JSX.Element | null;
export declare namespace ChoroplethTooltip {
    var displayName: string;
}
export default ChoroplethTooltip;
