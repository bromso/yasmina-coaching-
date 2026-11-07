import { type ReactNode } from "react";
interface ProfitLossLegendHoverContextValue {
    hoveredIndex: number | null;
}
export declare function ProfitLossLegendHoverProvider({ hoveredIndex, children, }: {
    hoveredIndex: number | null;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useProfitLossLegendHover(): ProfitLossLegendHoverContextValue;
export {};
