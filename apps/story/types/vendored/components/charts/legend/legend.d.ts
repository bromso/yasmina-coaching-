import { type ReactElement } from "react";
import { type LegendItemData } from "./legend-context";
export interface LegendProps {
    /** Legend items data */
    items: LegendItemData[];
    /** Controlled hover state */
    hoveredIndex?: number | null;
    /** Hover state change callback */
    onHoverChange?: (index: number | null) => void;
    /** Title shown above the legend */
    title?: string;
    /** Title class name */
    titleClassName?: string;
    /** Container class name */
    className?: string;
    /** Children - should contain a single LegendItem that will be mapped for each item */
    children: ReactElement;
}
export declare function Legend({ items, hoveredIndex: controlledHoveredIndex, onHoverChange, title, titleClassName, className, children, }: LegendProps): import("react").JSX.Element;
export declare namespace Legend {
    var displayName: string;
}
