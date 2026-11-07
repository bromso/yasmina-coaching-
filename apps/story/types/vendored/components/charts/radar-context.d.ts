import type { Transition } from "motion/react";
import { type ReactNode } from "react";
export declare const radarCssVars: {
    background: string;
    foreground: string;
    foregroundMuted: string;
    label: string;
    grid: string;
    border: string;
    area1: string;
    area2: string;
    area3: string;
    area4: string;
    area5: string;
};
export declare const defaultRadarColors: string[];
export interface RadarMetric {
    /** Unique key for the metric */
    key: string;
    /** Display label for the metric */
    label: string;
}
export interface RadarData {
    /** Display label for this data series */
    label: string;
    /** Color for this data series (defaults to chart-1 through chart-5) */
    color?: string;
    /** Metric values (key -> value, normalized 0-100) */
    values: Record<string, number>;
}
export interface RadarHoverContextValue {
    hoveredIndex: number | null;
    setHoveredIndex: (index: number | null) => void;
}
export interface RadarStableContextValue {
    data: RadarData[];
    metrics: RadarMetric[];
    size: number;
    radius: number;
    levels: number;
    animate: boolean;
    /** Total enter animation budget in ms */
    enterDurationMs: number;
    /** Scales stagger delays between grid / campaigns / metrics */
    staggerScale: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Changes when motion settings change — replays enter animations. */
    motionReplayKey: string;
    getColor: (index: number) => string;
    getAngle: (metricIndex: number) => number;
    getPointPosition: (metricIndex: number, value: number) => {
        x: number;
        y: number;
    };
    yScale: (value: number) => number;
}
export type RadarContextValue = RadarStableContextValue & RadarHoverContextValue;
declare const RadarStableContext: import("react").Context<RadarStableContextValue | null>;
export declare function RadarProvider({ children, value, }: {
    children: ReactNode;
    value: RadarContextValue;
}): import("react").JSX.Element;
export declare function useRadarStable(): RadarStableContextValue;
export declare function useRadarHover(): RadarHoverContextValue;
export declare function useRadar(): RadarContextValue;
export default RadarStableContext;
