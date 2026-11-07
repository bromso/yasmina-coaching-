import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type LineConfig, type Margin } from "./chart-context";
import { type ChartPhase } from "./chart-phase";
export interface ScatterChartInnerProps {
    width: number;
    height: number;
    data: Record<string, unknown>[];
    xDataKey: string;
    margin: Margin;
    animationDuration: number;
    animationEasing?: string;
    enterTransition?: Transition;
    revealSignature?: string;
    children: ReactNode;
    containerRef: React.RefObject<HTMLDivElement | null>;
    lines: LineConfig[];
    onPhaseChange?: (phase: ChartPhase) => void;
}
export declare function ScatterChartInner({ width, height, data, xDataKey, margin, animationDuration, animationEasing, enterTransition, revealSignature, children, containerRef, lines, onPhaseChange, }: ScatterChartInnerProps): import("react").JSX.Element | null;
