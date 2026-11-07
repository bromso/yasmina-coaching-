import type { ChartPhase } from "./chart-phase";
import { type YDomain } from "./y-domain-utils";
export interface UseAnimatedYDomainsOptions {
    enabled: boolean;
    durationMs: number;
    chartPhase: ChartPhase;
    skeletonByAxis: Record<string, YDomain>;
    targetByAxis: Record<string, YDomain>;
    onSettled?: () => void;
    /** When true, tweens y-domains on target changes while the chart is in the ready phase (e.g. brush zoom). */
    tweenOnTargetChange?: boolean;
}
export declare function useAnimatedYDomains({ enabled, durationMs, chartPhase, skeletonByAxis, targetByAxis, onSettled, tweenOnTargetChange, }: UseAnimatedYDomainsOptions): Record<string, YDomain>;
