import type { ReactNode } from "react";
export interface StatCardHoverState {
    value: number | null;
    label: string | null;
    trend: number | null;
}
export declare const statCardValueClassName = "text-3xl font-semibold leading-none tracking-tight";
export declare const statCardLabelClassName = "mt-0 text-xs";
export declare const statCardChartHeights: {
    readonly sm: "[--stat-card-chart-h:96px]";
    readonly md: "[--stat-card-chart-h:190px]";
    readonly lg: "[--stat-card-chart-h:420px]";
};
/** Bleeds charts edge-to-edge inside stat card content padding. */
export declare function StatCardChart({ children, className, size, }: {
    children: ReactNode;
    className?: string;
    size?: keyof typeof statCardChartHeights;
}): import("react").JSX.Element;
