import type { Transition } from "motion/react";
import { type ReactNode, type RefObject } from "react";
import type { ArcDatum, Focus, SunburstEnterTiming } from "./sunburst";
import type { SunburstNode } from "./sunburst-data";
export declare const sunburstCssVars: {
    background: string;
    foreground: string;
    foregroundMuted: string;
    label: string;
    ring: string;
    slice1: string;
    slice2: string;
    slice3: string;
    slice4: string;
    slice5: string;
};
export declare const defaultSunburstColors: string[];
/** Relative depth within the current focus view (1 = innermost visible ring). */
export declare function opacityForRelativeDepth(relativeDepth: number): number;
export interface SunburstHoverContextValue {
    hoveredArcIndex: number | null;
    setHoveredArcIndex: (index: number | null) => void;
    hoveredArc: ArcDatum | null;
    setHoveredArc: (arc: ArcDatum | null) => void;
}
export interface SunburstStableContextValue {
    data: SunburstNode;
    arcs: ArcDatum[];
    focusById: Map<string, Focus>;
    rootId: string;
    maxDepth: number;
    radius: number;
    size: number;
    focus: Focus;
    prevFocus: Focus;
    focusId: string;
    zoomTo: (nextId: string) => void;
    zoomT: number;
    enterTiming: SunburstEnterTiming;
    skipEnterAnimation: boolean;
    growAmountForArc: (arcId: string) => number;
    getColor: (categoryIndex: number, nodeColor?: string) => string;
    getFill: (arcIndex: number, fillOverride?: string, colorOverride?: string) => string;
    getFillOpacity: (relativeDepth: number, override?: number) => number;
    isRelated: (arc: ArcDatum) => boolean;
    isDescendant: (arc: ArcDatum, ancestorId: string) => boolean;
    enterTransition?: Transition;
    enterStaggerScale: number;
    playKey: number;
    hoverPop: number;
    maxExpandedThickness: number;
    containerRef: RefObject<HTMLDivElement | null>;
}
export type SunburstContextValue = SunburstStableContextValue & SunburstHoverContextValue;
export declare function SunburstProvider({ children, value, }: {
    children: ReactNode;
    value: SunburstContextValue;
}): import("react").JSX.Element;
export declare function useSunburstStable(): SunburstStableContextValue;
export declare function useSunburstHover(): SunburstHoverContextValue;
