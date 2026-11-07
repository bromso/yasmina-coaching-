export interface ScheduledTooltipControls<T> {
    tooltipData: T | null;
    setTooltipData: React.Dispatch<React.SetStateAction<T | null>>;
    scheduleTooltip: (tooltip: T, dedupeKey?: string) => void;
    clearTooltip: () => void;
    resetTooltipDedupe: () => void;
}
export declare function useScheduledTooltip<T>(): ScheduledTooltipControls<T>;
