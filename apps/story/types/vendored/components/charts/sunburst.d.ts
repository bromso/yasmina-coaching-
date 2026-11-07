import type { SunburstNode } from "./sunburst-data";
export interface ArcDatum {
    id: string;
    name: string;
    depth: number;
    value: number;
    categoryIndex: number;
    hasChildren: boolean;
    trail: string[];
    parentId: string | null;
    a0: number;
    a1: number;
    /** Stable index for Studio layer wiring. */
    arcIndex: number;
    /** Optional color override from data node. */
    color?: string;
    /** Optional fill override from data node (patterns). */
    fill?: string;
}
export interface Focus {
    id: string;
    name: string;
    depth: number;
    parentId: string | null;
    categoryIndex: number;
    a0: number;
    a1: number;
}
export interface ArcGeometry {
    a0: number;
    a1: number;
    innerR: number;
    outerR: number;
}
export declare function sumValues(node: SunburstNode): number;
export declare function buildArcs(data: SunburstNode): {
    arcs: ArcDatum[];
    maxDepth: number;
    total: number;
    focusById: Map<string, Focus>;
    rootId: string;
};
export declare function ringOptions(focusDepth: number, maxDepth: number, radius: number): {
    centerR: number;
    ringWidth: number;
};
export declare function geometryFor(arc: ArcDatum, focus: Focus, maxDepth: number, radius: number): ArcGeometry | null;
export declare function lerpGeometry(from: ArcGeometry, to: ArcGeometry, progress: number): ArcGeometry;
/** Zoom morph — lerps matching arcs; entering/exiting arcs collapse to a point. */
export declare function transitionGeometry(arc: ArcDatum, fromFocus: Focus, toFocus: Focus, maxDepth: number, radius: number, progress: number): ArcGeometry | null;
/** Normalized clockwise angle from 12 o'clock (0 → 1). */
export declare function clockwiseFraction(angle: number): number;
/** Ring-chart-style enter delay (seconds) — scale from center. */
export interface SunburstSegmentEnterDelays {
    delay: number;
}
export interface SunburstEnterTiming {
    segmentDelays: Map<string, SunburstSegmentEnterDelays>;
    maxDelay: number;
}
/** Matches ring chart expand — each ring/segment grows from the chart center. */
export declare function buildSunburstEnterTiming(arcs: ArcDatum[], staggerScale?: number): SunburstEnterTiming;
/** @deprecated Use buildSunburstEnterTiming */
export interface SunburstRevealSchedule {
    ringStarts: Map<number, number>;
    ringDuration: number;
    segmentsCompleteAt: number;
    labelsStart: number;
    labelDuration: number;
}
/** @deprecated Use buildSunburstEnterTiming */
export declare function buildRevealSchedule(arcs: ArcDatum[], staggerScale?: number): SunburstRevealSchedule;
/** @deprecated Ring sweep reveal — use expand + sweep enter instead. */
export declare function segmentRevealFromRingSweep(ringProgress: number, a0: number, a1: number): {
    angular: number;
    radial: number;
};
/** @deprecated Use buildSunburstEnterTiming */
export declare function buildRevealDelays(arcs: ArcDatum[]): Map<string, number>;
export declare function arcPath(geometry: ArcGeometry, progress: number, radialProgress?: number): string | null;
export declare function centroidAngle(arc: ArcDatum): number;
export declare function geomCentroidAngle(geometry: ArcGeometry): number;
export declare function geomCentroidRadius(geometry: ArcGeometry): number;
/** Visible path length from focus to hovered arc (in ring count). */
export declare function visibleHoverPathLength(hoveredDepth: number, focusDepth: number): number;
/** Scale hover grow so deep paths and wide drill-down rings stay within budget. */
export declare function hoverGrowForPathSegment(hoverPop: number, ringWidth: number, pathLength: number): number;
/**
 * Max radial thickness for a hovered segment — matches one expanded ring at the
 * first drill level (e.g. Enterprise under Product).
 */
export declare function maxHoverSegmentThickness(maxDepth: number, radius: number, hoverPop: number, referenceFocusDepth?: number): number;
export declare function buildHoverGrowTargets(arcs: ArcDatum[], hoveredArc: ArcDatum, focus: Focus, maxDepth: number, radius: number, hoverPop: number, isOnHoverPath: (arc: ArcDatum, hoveredId: string) => boolean): Map<string, number>;
/** Inset reserved around the drawable chart so hover growth stays inside the view box. */
export declare function defaultSunburstGrowPadding(maxDepth: number, size: number, hoverPop: number): number;
/** Sum of hover grow from ancestors on the path to this arc (excludes self). */
export declare function ancestorGrowOffset(arcId: string, growAmountForArc: (id: string) => number): number;
/** Shift descendants outward and expand the hovered segment on its outer edge. */
export declare function applyHoverGrow(base: ArcGeometry, arcId: string, growAmountForArc: (id: string) => number, maxExpandedThickness: number): ArcGeometry;
export declare function localProgress(progress: number, delay: number, duration: number): number;
