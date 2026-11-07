import { type ReactNode } from "react";
interface ChartLegendHoverContextValue {
    hoveredIndex: number | null;
    setHoveredIndex: (index: number | null) => void;
}
export declare function ChartLegendHoverProvider({ hoveredIndex, onHoverChange, children, }: {
    hoveredIndex: number | null;
    onHoverChange: (index: number | null) => void;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useChartLegendHover(): ChartLegendHoverContextValue;
export {};
