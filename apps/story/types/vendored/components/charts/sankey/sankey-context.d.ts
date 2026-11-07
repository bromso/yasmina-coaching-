import type { SankeyGraph, SankeyLink, SankeyNode } from "d3-sankey";
import type { Transition } from "motion/react";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
export interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface SankeyNodeDatum {
    name: string;
    category?: "source" | "landing" | "outcome";
    [key: string]: unknown;
}
export interface SankeyLinkDatum {
    source: number;
    target: number;
    value: number;
    [key: string]: unknown;
}
export interface SankeyTooltipData {
    type: "node" | "link";
    nodeIndex?: number;
    linkIndex?: number;
    x: number;
    y: number;
    data: SankeyNodeDatum | SankeyLinkDatum;
}
export interface SankeyContextValue {
    graph: SankeyGraph<SankeyNodeDatum, SankeyLinkDatum>;
    nodes: SankeyNode<SankeyNodeDatum, SankeyLinkDatum>[];
    links: SankeyLink<SankeyNodeDatum, SankeyLinkDatum>[];
    width: number;
    height: number;
    innerWidth: number;
    innerHeight: number;
    margin: Margin;
    hoveredNodeIndex: number | null;
    hoveredLinkIndex: number | null;
    setHoveredNodeIndex: (index: number | null) => void;
    setHoveredLinkIndex: (index: number | null) => void;
    tooltipData: SankeyTooltipData | null;
    setTooltipData: Dispatch<SetStateAction<SankeyTooltipData | null>>;
    containerRef: RefObject<HTMLDivElement | null>;
    isLoaded: boolean;
    animationDuration: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Increments when enter animation should replay. */
    revealEpoch: number;
    mousePos: {
        x: number;
        y: number;
    } | null;
    createPath: (link: SankeyLink<SankeyNodeDatum, SankeyLinkDatum>) => string;
}
export declare function SankeyProvider({ children, value, }: {
    children: React.ReactNode;
    value: SankeyContextValue;
}): import("react").JSX.Element;
export declare function useSankey(): SankeyContextValue;
export declare const sankeyCssVars: {
    background: string;
    foreground: string;
    nodePrimary: string;
    nodeSecondary: string;
    linkColor: string;
};
