import type { ReactNode } from "react";
import { type ChartStatFlowFormat } from "./chart-stat-flow";
export interface PieCenterProps {
    /** Label shown below the value. Default: "Total" when not hovering */
    defaultLabel?: string;
    /** Format options for NumberFlow. Default: standard notation */
    formatOptions?: ChartStatFlowFormat;
    /** Custom render function for complete control over center content */
    children?: (props: {
        value: number;
        label: string;
        isHovered: boolean;
        data: {
            label: string;
            value: number;
            color?: string;
            fill?: string;
        };
    }) => ReactNode;
    /** Additional class name for the container */
    className?: string;
    /** Class name for the value text. Scales with center size via container queries. */
    valueClassName?: string;
    /** Class name for the label text. Scales with center size via container queries. */
    labelClassName?: string;
    /** Prefix to show before the number (e.g., "$") */
    prefix?: string;
    /** Suffix to show after the number (e.g., "%") */
    suffix?: string;
}
/**
 * PieCenter displays content in the center of a donut/pie chart.
 *
 * This component renders as pure HTML (not inside SVG foreignObject) to avoid
 * Safari's WebKit bug #23113 where HTML content with CSS transforms/opacity
 * inside foreignObject renders at incorrect positions.
 *
 * The parent PieChart uses CSS Grid stacking to overlay this HTML content
 * on top of the SVG slices.
 */
export declare function PieCenter({ defaultLabel, formatOptions, children, className, valueClassName, labelClassName, prefix, suffix, }: PieCenterProps): import("react").JSX.Element | null;
export declare namespace PieCenter {
    var displayName: string;
}
export default PieCenter;
