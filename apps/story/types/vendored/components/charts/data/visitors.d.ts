import type { ChoroplethFeature } from "../choropleth";
export declare const visitorsByCountry: Record<string, number>;
export declare const visitorStats: {
    trend: number;
    total: number;
};
export declare function getVisitorColor(feature: ChoroplethFeature): string;
export declare function getVisitorValue(feature: ChoroplethFeature): number | undefined;
export declare function computeVisitorTrend(visitors: number): number;
