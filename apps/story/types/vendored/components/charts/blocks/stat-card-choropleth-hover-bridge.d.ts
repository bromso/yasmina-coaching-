import type { StatCardHoverState } from "./stat-card-chart";
/** Syncs hovered choropleth feature into stat card NumberFlow and trend badge. */
export declare function StatCardChoroplethHoverBridge({ onHoverChange, }: {
    onHoverChange: (state: StatCardHoverState) => void;
}): null;
