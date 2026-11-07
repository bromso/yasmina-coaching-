export interface ChartLoadingLabelProps {
    /** Label shown centered over the chart. */
    text?: string;
    className?: string;
    /** Animate down, fade, and blur during loading → ready handoff. */
    exiting?: boolean;
}
export declare function ChartLoadingLabel({ text, className, exiting, }: ChartLoadingLabelProps): import("react").JSX.Element | null;
export default ChartLoadingLabel;
