import { type ChartPhase, type ChartStatus } from "./chart-phase";
export interface UseChartPhaseOrchestratorOptions {
    chartStatus: ChartStatus;
    targetData: Record<string, unknown>[];
    skeletonData: Record<string, unknown>[];
    animationDuration: number;
    yDomainTweenDuration: number;
    /** Signature of motion URL state — replays clip reveal in Studio. */
    revealSignature?: string;
    /** Skip mount/signature enter reveal (static docs previews). */
    skipEnterReveal?: boolean;
}
export declare function useChartPhaseOrchestrator({ chartStatus, targetData, skeletonData, animationDuration, yDomainTweenDuration, revealSignature, skipEnterReveal, }: UseChartPhaseOrchestratorOptions): {
    chartPhase: ChartPhase;
    plotData: Record<string, unknown>[];
    revealEpoch: number;
    concealEpoch: number;
    isLoaded: boolean;
    notifyLoadingPulseComplete: () => void;
    notifyRevealConcealComplete: () => void;
    notifyYDomainTweenComplete: () => void;
};
