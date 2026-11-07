export declare const PROFIT_LOSS_LEGEND_ITEMS: readonly [{
    readonly label: "Profit";
    readonly value: 0;
    readonly color: "var(--color-emerald-500)";
}, {
    readonly label: "Loss";
    readonly value: 0;
    readonly color: "var(--color-red-500)";
}];
export interface ProfitLossLegendProps {
    hoveredIndex?: number | null;
    onHoverChange?: (index: number | null) => void;
    align?: "start" | "center" | "end";
    className?: string;
}
export declare function ProfitLossLegend({ hoveredIndex, onHoverChange, align, className, }: ProfitLossLegendProps): import("react").JSX.Element;
