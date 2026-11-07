import type { Transition } from "motion/react";
import { type ReactNode, type RefObject } from "react";
export declare const pieCssVars: {
    background: string;
    foreground: string;
    foregroundMuted: string;
    label: string;
    slice1: string;
    slice2: string;
    slice3: string;
    slice4: string;
    slice5: string;
};
export declare const defaultPieColors: string[];
export interface PieData {
    /** Display label for the slice */
    label: string;
    /** Value for the slice (determines slice size relative to total) */
    value: number;
    /** Optional color override - falls back to palette */
    color?: string;
    /** Optional fill override for patterns/gradients (e.g., "url(#patternId)") */
    fill?: string;
}
/** Arc data computed by visx Pie */
export interface PieArcData {
    data: PieData;
    index: number;
    startAngle: number;
    endAngle: number;
    padAngle: number;
    value: number;
}
export interface PieHoverContextValue {
    hoveredIndex: number | null;
    setHoveredIndex: (index: number | null) => void;
}
export interface PieStableContextValue {
    data: PieData[];
    arcs: PieArcData[];
    size: number;
    center: number;
    outerRadius: number;
    innerRadius: number;
    padAngle: number;
    cornerRadius: number;
    hoverOffset: number;
    animationKey: number;
    isLoaded: boolean;
    enterTransition?: Transition;
    enterStaggerScale: number;
    containerRef: RefObject<HTMLDivElement | null>;
    totalValue: number;
    getColor: (index: number) => string;
    getFill: (index: number) => string;
    /**
     * Studio geometry scrub — skip Motion path morphing and use plain SVG paths.
     * @default false
     */
    geometryScrubbing: boolean;
    /** Precomputed slice paths during geometry scrub (one per arc). */
    scrubSlicePaths: readonly string[] | null;
}
export type PieContextValue = PieStableContextValue & PieHoverContextValue;
declare const PieStableContext: import("react").Context<PieStableContextValue | null>;
export declare function PieProvider({ children, value }: {
    children: ReactNode;
    value: PieContextValue;
}): import("react").JSX.Element;
export declare function usePieStable(): PieStableContextValue;
export declare function usePieHover(): PieHoverContextValue;
export declare function usePie(): PieContextValue;
export default PieStableContext;
