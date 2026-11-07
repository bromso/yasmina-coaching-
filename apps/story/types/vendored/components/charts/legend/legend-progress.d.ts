export interface LegendProgressProps {
    /** Track class name */
    trackClassName?: string;
    /** Indicator class name */
    indicatorClassName?: string;
    /** Track height. Default: "h-1.5" */
    height?: string;
}
export declare function LegendProgress({ trackClassName, indicatorClassName, height, }: LegendProgressProps): import("react").JSX.Element | null;
export declare namespace LegendProgress {
    var displayName: string;
}
