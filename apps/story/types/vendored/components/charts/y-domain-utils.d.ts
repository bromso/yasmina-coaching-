import type { LineConfig } from "./chart-context";
import { type ChartPhase } from "./chart-phase";
export type YDomain = [number, number];
/** Apply visx `nice()` to raw domain endpoints for stable grid ticks. */
export declare function niceYDomain(domain: YDomain): YDomain;
/**
 * Skip Y tween when both endpoints move less than the threshold relative to span.
 * When in doubt callers should tween — beauty wins over micro-optimization.
 */
export declare function shouldTweenYDomain(from: YDomain, to: YDomain): boolean;
/** Phases where the chart shows loading chrome (shimmer, pulse, label). */
export declare function isLoadingChromePhase(phase: ChartPhase): boolean;
/** Phases where grid lines use loading stroke styling (muted / dashed chrome). */
export declare function isLoadingGridChromePhase(phase: ChartPhase): boolean;
/** Phases where Y-domain tween runs after the series has exited. */
export declare function isYDomainTweenPhase(phase: ChartPhase): boolean;
/** Phases where {@link ReferenceArea} bands are shown (fade in/out on transitions). */
export declare function isReferenceAreaVisiblePhase(phase: ChartPhase): boolean;
export declare function resolveAnimatedYDestinationDomains(chartPhase: ChartPhase, skeletonByAxis: Record<string, YDomain>, targetByAxis: Record<string, YDomain>): Record<string, YDomain>;
export declare function computeYDomainsByAxis({ lines, resolveDomain, }: {
    lines: LineConfig[];
    resolveDomain: (dataKeys: string[]) => YDomain;
}): Record<string, YDomain>;
/** Merge domain maps, normalizing axis ids to strings. */
export declare function mergeYDomainRecords(...records: Record<string, YDomain>[]): Record<string, YDomain>;
export declare function domainsEqual(left: Record<string, YDomain>, right: Record<string, YDomain>): boolean;
