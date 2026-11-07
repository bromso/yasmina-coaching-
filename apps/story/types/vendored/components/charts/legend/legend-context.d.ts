export declare const legendCssVars: {
    background: string;
    foreground: string;
    muted: string;
    mutedForeground: string;
    track: string;
};
export interface LegendItemData {
    /** Display label */
    label: string;
    /** Current value */
    value: number;
    /** Maximum value (for progress/percentage calculation) */
    maxValue?: number;
    /** Item color */
    color: string;
}
export interface LegendContextValue {
    /** All legend items */
    items: LegendItemData[];
    /** Currently hovered index */
    hoveredIndex: number | null;
    /** Set hovered index */
    setHoveredIndex: (index: number | null) => void;
}
export interface LegendItemContextValue {
    /** The current item data */
    item: LegendItemData;
    /** Index of this item */
    index: number;
    /** Whether this item is hovered */
    isHovered: boolean;
    /** Whether this item is faded (another item is hovered) */
    isFaded: boolean;
    /** Percentage value (value / maxValue * 100) */
    percentage: number;
}
export declare function LegendProvider({ children, value, }: {
    children: React.ReactNode;
    value: LegendContextValue;
}): import("react").JSX.Element;
export declare function LegendItemProvider({ children, value, }: {
    children: React.ReactNode;
    value: LegendItemContextValue;
}): import("react").JSX.Element;
export declare function useLegend(): LegendContextValue;
export declare function useLegendItem(): LegendItemContextValue;
