import type { StatCardHoverState } from "./stat-card-chart";
export type { StatCardHoverState } from "./stat-card-chart";
export declare function formatStatCardMonth(date: Date): string;
export declare function formatStatCardWeekday(date: Date): string;
/** Syncs hovered chart values, labels, and trend into stat card UI. */
export declare function StatCardHoverBridge({ dataKey, dateKey, formatLabel, onHoverChange, }: {
    dataKey: string;
    dateKey?: string;
    formatLabel: (date: Date) => string;
    onHoverChange: (state: StatCardHoverState) => void;
}): null;
