import { type ReactNode } from "react";
/** Subset of `Intl.NumberFormatOptions` supported by NumberFlow */
export interface ChartStatFlowFormat {
    notation?: "standard" | "compact";
    compactDisplay?: "short" | "long";
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    minimumIntegerDigits?: number;
    minimumSignificantDigits?: number;
    maximumSignificantDigits?: number;
    style?: "decimal" | "percent" | "currency";
    currency?: string;
    currencyDisplay?: "symbol" | "narrowSymbol" | "code" | "name";
    unit?: string;
    unitDisplay?: "short" | "long" | "narrow";
}
export declare const defaultChartStatFlowFormat: ChartStatFlowFormat;
export interface ChartStatFlowProps {
    value: number;
    label: string;
    formatOptions?: ChartStatFlowFormat;
    prefix?: string;
    suffix?: string;
    valueClassName?: string;
    labelClassName?: string;
    icon?: ReactNode;
}
/**
 * Shared value + label stack using NumberFlow (same layout as pie / ring centers).
 * Parent should provide flex alignment and sizing when needed.
 */
export declare function ChartStatFlow({ value, label, formatOptions, prefix, suffix, valueClassName, labelClassName, icon, }: ChartStatFlowProps): import("react").JSX.Element;
export declare namespace ChartStatFlow {
    var displayName: string;
}
