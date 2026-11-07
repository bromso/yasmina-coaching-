import type { ReactNode } from "react";
import { type ChartStatFlowFormat } from "./chart-stat-flow";
export type GaugeLabelPlacement = "top" | "bottom" | "left" | "right";
export type GaugeLabelAlign = "start" | "center" | "end";
export interface GaugeLabelShellProps {
    centerValue: number;
    defaultLabel?: string;
    prefix?: string;
    suffix?: string;
    formatOptions?: ChartStatFlowFormat;
    align?: GaugeLabelAlign;
    className?: string;
}
export declare function GaugeLabelShell({ centerValue, defaultLabel, prefix, suffix, formatOptions, align, className, }: GaugeLabelShellProps): import("react").JSX.Element;
export declare function GaugeLabelLayout({ placement, align, label, children, className, }: {
    placement: GaugeLabelPlacement;
    align: GaugeLabelAlign;
    label: ReactNode | null;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
