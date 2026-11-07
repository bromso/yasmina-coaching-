import { type Transition } from "motion/react";
import { type ReactNode } from "react";
import { type ChartStatFlowFormat } from "./chart-stat-flow";
import { type GaugeLabelAlign, type GaugeLabelPlacement } from "./gauge-label-layout";
export type GaugeOrientation = "arc" | "linear";
export interface GaugeProps {
    /** Arc (default) or horizontal linear notch track */
    orientation?: GaugeOrientation;
    /** Fill level 0–100 */
    value: number;
    /** Number of notches */
    totalNotches?: number;
    /** Percentage of the track reserved for gaps between notches */
    spacing?: number;
    notchCornerRadius?: number;
    /** `true` = rectangular notches; `false` = tapered toward center / midline */
    uniformWidth?: boolean;
    startAngle?: number;
    endAngle?: number;
    useGradient?: boolean;
    activeGradient?: readonly [string, string];
    inactiveGradient?: readonly [string, string];
    /** Center statistic — omit to hide the label block */
    centerValue?: number;
    defaultLabel?: string;
    prefix?: string;
    suffix?: string;
    formatOptions?: ChartStatFlowFormat;
    /** Label position for `orientation="linear"`. Arc gauges always overlay center. */
    labelPlacement?: GaugeLabelPlacement;
    /** Cross-axis alignment (start / center / end), same model as chart legend */
    labelAlign?: GaugeLabelAlign;
    inactiveFill?: string;
    activeFill?: string;
    inactiveFillOpacity?: number;
    activeFillOpacity?: number;
    children?: ReactNode;
    className?: string;
    width?: number;
    height?: number;
    minWidth?: number;
    notchLengthPercent?: number;
    /** Linear only — notch width as % of each slot (default 80) */
    notchWidthPercent?: number;
    /** Linear only — bar thickness in px when responsive (default 24) */
    linearHeight?: number;
    enterTransition?: Transition;
    enterStaggerScale?: number;
    /** Studio-only: static paths while scrubbing geometry controls */
    geometryScrubbing?: boolean;
}
export declare function Gauge({ width: widthProp, height: heightProp, className, minWidth, orientation, linearHeight, ...props }: GaugeProps): import("react").JSX.Element;
export declare namespace Gauge {
    var displayName: string;
}
