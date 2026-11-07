export interface LegendValueProps {
    /** Value class name. Default: "text-sm tabular-nums" */
    className?: string;
    /** Show percentage alongside value. Default: false */
    showPercentage?: boolean;
    /** Percentage class name. Default: "text-xs tabular-nums" */
    percentageClassName?: string;
    /** Format function for the value. Default: toLocaleString() */
    formatValue?: (value: number) => string;
    /** Format function for percentage. Default: (p) => `${p.toFixed(0)}%` */
    formatPercentage?: (percentage: number) => string;
}
export declare function LegendValue({ className, showPercentage, percentageClassName, formatValue, formatPercentage, }: LegendValueProps): import("react").JSX.Element;
export declare namespace LegendValue {
    var displayName: string;
}
