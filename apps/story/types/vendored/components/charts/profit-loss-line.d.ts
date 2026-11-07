import { type FadeEdges } from "./fade-edges";
type CurveFactory = any;
export declare const PROFIT_LOSS_POSITIVE_COLOR = "var(--color-emerald-500)";
export declare const PROFIT_LOSS_NEGATIVE_COLOR = "var(--color-red-500)";
export declare function profitLossColor(value: number): "var(--color-emerald-500)" | "var(--color-red-500)";
export declare const PROFIT_LOSS_TOOLTIP_LABEL_FALLBACK = "Profit/Loss";
export declare function resolveProfitLossTooltipLabel(label: string): string;
export interface ProfitLossLineProps {
    dataKey: string;
    xDataKey?: string;
    strokeWidth?: number;
    positiveColor?: string;
    negativeColor?: string;
    /** Curve function. Default: curveLinear */
    curve?: CurveFactory;
    /**
     * Fade the line stroke toward transparent at the chart edges.
     * Default: false
     */
    fadeEdges?: FadeEdges;
}
export declare function ProfitLossLine({ dataKey, xDataKey, strokeWidth, positiveColor, negativeColor, curve, fadeEdges, }: ProfitLossLineProps): import("react").JSX.Element;
export declare namespace ProfitLossLine {
    var displayName: string;
}
export {};
