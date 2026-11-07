import type { ChartPhase } from "./chart-phase";
export type LineLoadingPulseMode = "loop" | "exit" | "enter";
export declare function resolveLineLoadingPulseMode(phase: ChartPhase): LineLoadingPulseMode | null;
export interface LineLoadingPulseStrokeProps {
    pathD: string;
    mode?: LineLoadingPulseMode;
    /** Bumps to restart loop cycles without remounting the stroke. */
    loopEpoch?: number;
    stroke?: string;
    /** Stroke opacity for the animated segment. Default: 0.5 */
    strokeOpacity?: number;
    strokeWidth?: number;
    onCycleComplete?: () => void;
}
export declare function LineLoadingPulseStroke({ pathD, mode, loopEpoch, stroke, strokeOpacity, strokeWidth, onCycleComplete, }: LineLoadingPulseStrokeProps): import("react").JSX.Element | null;
export declare namespace LineLoadingPulseStroke {
    var displayName: string;
}
export default LineLoadingPulseStroke;
