import { type SpringConfig } from "../chart-config-context";
export interface TooltipDotProps {
    x: number;
    y: number;
    visible: boolean;
    color: string;
    /** Half of width/height for dots; half-extent for ring squares. Default: 5 */
    size?: number;
    strokeColor?: string;
    strokeWidth?: number;
    /** Dot fill or transparent ring around the hovered mark. Default: "dot" */
    variant?: "dot" | "ring";
    /**
     * Ring corner radius as a fraction of side length (0 = square, 0.5 = circle).
     * Same semantics as bar square radius.
     */
    cornerRadiusFraction?: number;
    /** Per-chart override; falls back to `ChartConfigProvider.tooltipSpring`. */
    springConfig?: SpringConfig;
    /** Animate position with a spring. Default: true */
    animate?: boolean;
}
export declare function TooltipDot({ x, y, visible, color, size, strokeColor, strokeWidth, variant, cornerRadiusFraction, springConfig, animate, }: TooltipDotProps): import("react").JSX.Element | null;
export declare namespace TooltipDot {
    var displayName: string;
}
export default TooltipDot;
