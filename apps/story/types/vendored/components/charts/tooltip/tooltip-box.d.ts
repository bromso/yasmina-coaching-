import { useSpring } from "motion/react";
import type { RefObject } from "react";
import { type SpringConfig } from "../chart-config-context";
export interface TooltipBoxProps {
    /** X position in pixels (relative to container) */
    x: number;
    /** Y position in pixels (relative to container) */
    y: number;
    /** Whether the tooltip is visible */
    visible: boolean;
    /** Container ref for portal rendering */
    containerRef: RefObject<HTMLDivElement | null>;
    /** Container width for flip detection */
    containerWidth: number;
    /** Container height for bounds clamping */
    containerHeight: number;
    /** Offset from the target position */
    offset?: number;
    /** Custom class name */
    className?: string;
    /** Tooltip content */
    children: React.ReactNode;
    /** Override left position (bypasses internal calculation) */
    left?: number | ReturnType<typeof useSpring>;
    /** Override top position (bypasses internal calculation) */
    top?: number | ReturnType<typeof useSpring>;
    /** Force flip direction (for custom positioning) */
    flipped?: boolean;
    /** Per-chart override; falls back to `ChartConfigProvider.tooltipBoxSpring`. */
    springConfig?: SpringConfig;
    /** Animate panel position with a spring. Default: true */
    animate?: boolean;
    /** Fade/scale the panel on show. Default: true */
    entrance?: boolean;
    /** Inline styles for the inner tooltip panel. */
    panelStyle?: React.CSSProperties;
    /**
     * Tooltip panel background color (CSS variable or color value).
     * Default: `var(--chart-tooltip-background)`.
     */
    backgroundColor?: string;
}
export declare function TooltipBox(props: TooltipBoxProps): import("react").JSX.Element | null;
export declare namespace TooltipBox {
    var displayName: string;
}
export default TooltipBox;
