import { scaleLinear } from "@visx/scale";
import type { LineConfig } from "./chart-context";
/** Default axis id when `yAxisId` is omitted (Recharts-style `0` / primary left axis). */
export declare const DEFAULT_Y_AXIS_ID = "left";
export type YAxisOrientation = "left" | "right";
export declare function normalizeYAxisId(id?: string | number): string;
export declare function groupLinesByYAxisId(lines: LineConfig[]): Map<string, LineConfig[]>;
type YScale = ReturnType<typeof scaleLinear<number>>;
export declare function getPrimaryYScale(yScales: Record<string, YScale>, fallback: YScale): YScale;
export declare function buildYScalesForLines({ lines, innerHeight, resolveDomain, }: {
    lines: LineConfig[];
    /** Passed by callers; domain is resolved via `resolveDomain`. */
    data?: Record<string, unknown>[];
    innerHeight: number;
    resolveDomain: (dataKeys: string[]) => [number, number];
}): Record<string, YScale>;
/** Build y-scales from pre-computed (already nice'd) domain endpoints. */
export declare function buildYScalesFromDomains({ lines, innerHeight, domainsByAxis, }: {
    lines: LineConfig[];
    innerHeight: number;
    domainsByAxis: Record<string, [number, number]>;
}): Record<string, YScale>;
/** Single-axis charts (bar, scatter, candlestick, live line). */
export declare function wrapSingleYScale(yScale: YScale): Record<string, YScale>;
export {};
