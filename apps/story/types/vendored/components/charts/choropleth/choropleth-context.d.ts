import type { ProvidedZoom, TransformMatrix } from "@visx/zoom";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Transition } from "motion/react";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
interface ZoomState {
    initialTransformMatrix: TransformMatrix;
    transformMatrix: TransformMatrix;
    isDragging: boolean;
}
export type ZoomInstance<E extends Element> = ProvidedZoom<E> & ZoomState;
interface ChoroplethZoomContextValue {
    zoom: ZoomInstance<SVGSVGElement> | null;
}
export declare const ChoroplethZoomContext: import("react").Context<ChoroplethZoomContextValue>;
export declare function useChoroplethZoom(): ChoroplethZoomContextValue;
export interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface ChoroplethFeatureProperties {
    name?: string;
    id?: string | number;
    [key: string]: unknown;
}
export type ChoroplethFeature = Feature<Geometry, ChoroplethFeatureProperties>;
export interface ChoroplethTooltipData {
    featureIndex: number;
    x: number;
    y: number;
    feature: ChoroplethFeature;
}
export interface ChoroplethInteractionContextValue {
    hoveredFeatureIndex: number | null;
    setHoveredFeatureIndex: (index: number | null) => void;
    tooltipData: ChoroplethTooltipData | null;
    setTooltipData: Dispatch<SetStateAction<ChoroplethTooltipData | null>>;
}
export interface ChoroplethStableContextValue {
    features: ChoroplethFeature[];
    featureCollection: FeatureCollection<Geometry, ChoroplethFeatureProperties>;
    /** Precomputed SVG path strings — one per feature index. */
    featurePaths: readonly (string | null)[];
    pathGenerator: (feature: ChoroplethFeature) => string | undefined;
    rawPathGenerator: (geo: any) => string | null;
    projectPoint: (coords: [number, number]) => [number, number] | null;
    width: number;
    height: number;
    innerWidth: number;
    innerHeight: number;
    margin: Margin;
    containerRef: RefObject<HTMLDivElement | null>;
    isLoaded: boolean;
    animationDuration: number;
    enterTransition?: Transition;
    revealEpoch: number;
}
export type ChoroplethContextValue = ChoroplethStableContextValue & ChoroplethInteractionContextValue;
export declare function ChoroplethStableProvider({ children, value, }: {
    children: React.ReactNode;
    value: ChoroplethStableContextValue;
}): import("react").JSX.Element;
export declare function ChoroplethInteractionShell({ children }: {
    children: React.ReactNode;
}): import("react").JSX.Element;
export declare function ChoroplethProvider({ children, value, }: {
    children: React.ReactNode;
    value: ChoroplethContextValue;
}): import("react").JSX.Element;
export declare function useChoroplethStable(): ChoroplethStableContextValue;
export declare function useChoroplethInteraction(): ChoroplethInteractionContextValue;
export declare function useChoropleth(): ChoroplethContextValue;
export declare const choroplethCssVars: {
    scale01: "var(--chart-scale-01)";
    scale02: "var(--chart-scale-02)";
    scale03: "var(--chart-scale-03)";
    scale04: "var(--chart-scale-04)";
    scale05: "var(--chart-scale-05)";
    patternColor: "var(--chart-scale-pattern-color)";
    stroke: string;
    background: string;
};
export declare const defaultChoroplethColors: ("var(--chart-scale-01)" | "var(--chart-scale-02)" | "var(--chart-scale-03)" | "var(--chart-scale-04)" | "var(--chart-scale-05)")[];
export {};
