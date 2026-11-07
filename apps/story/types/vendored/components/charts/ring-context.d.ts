import type { Transition } from "motion/react";
import { type ReactNode, type RefObject } from "react";
export declare const ringCssVars: {
    background: string;
    foreground: string;
    foregroundMuted: string;
    label: string;
    ringBackground: string;
    ring1: string;
    ring2: string;
    ring3: string;
    ring4: string;
    ring5: string;
};
export declare const defaultRingColors: string[];
export interface RingData {
    /** Display label for the ring */
    label: string;
    /** Current value */
    value: number;
    /** Maximum value (determines progress percentage) */
    maxValue: number;
    /** Optional color override - falls back to palette */
    color?: string;
}
export interface RingHoverContextValue {
    hoveredIndex: number | null;
    setHoveredIndex: (index: number | null) => void;
}
export interface RingStableContextValue {
    data: RingData[];
    size: number;
    center: number;
    strokeWidth: number;
    ringGap: number;
    baseInnerRadius: number;
    animationKey: number;
    isLoaded: boolean;
    enterTransition?: Transition;
    enterStaggerScale: number;
    containerRef: RefObject<HTMLDivElement | null>;
    totalValue: number;
    getColor: (index: number) => string;
    getRingRadii: (index: number) => {
        innerRadius: number;
        outerRadius: number;
    };
    startAngle: number;
    endAngle: number;
    /**
     * Studio geometry scrub — skip Motion path morphing and use plain SVG paths.
     * @default false
     */
    geometryScrubbing: boolean;
}
export type RingContextValue = RingStableContextValue & RingHoverContextValue;
declare const RingStableContext: import("react").Context<RingStableContextValue | null>;
export declare function RingProvider({ children, value, }: {
    children: ReactNode;
    value: RingContextValue;
}): import("react").JSX.Element;
export declare function useRingStable(): RingStableContextValue;
export declare function useRingHover(): RingHoverContextValue;
export declare function useRing(): RingContextValue;
export default RingStableContext;
