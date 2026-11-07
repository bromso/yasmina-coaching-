import type React from "react";
/**
 *  DotPattern Component Props
 *
 * @param {number} [width=16] - The horizontal spacing between dots
 * @param {number} [height=16] - The vertical spacing between dots
 * @param {number} [x=0] - The x-offset of the entire pattern
 * @param {number} [y=0] - The y-offset of the entire pattern
 * @param {number} [cx=1] - The x-offset of individual dots
 * @param {number} [cy=1] - The y-offset of individual dots
 * @param {number} [cr=1] - The radius of each dot
 * @param {string} [className] - Additional CSS classes to apply to the SVG container
 * @param {boolean} [glow=false] - Whether dots should have a glowing animation effect
 */
interface DotPatternProps extends React.SVGProps<SVGSVGElement> {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    cx?: number;
    cy?: number;
    cr?: number;
    className?: string;
    glow?: boolean;
    [key: string]: unknown;
}
/**
 * DotPattern Component
 *
 * A React component that creates an animated or static dot pattern background using SVG.
 * The pattern automatically adjusts to fill its container and can optionally display glowing dots.
 *
 * @component
 *
 * @see DotPatternProps for the props interface.
 *
 * @example
 * // Basic usage
 * <DotPattern />
 *
 * // With glowing effect and custom spacing
 * <DotPattern
 *   width={20}
 *   height={20}
 *   glow={true}
 *   className="opacity-50"
 * />
 *
 * @notes
 * - The component is client-side only ("use client")
 * - Automatically responds to container size changes
 * - When glow is enabled, dots will animate with random delays and durations
 * - Uses Motion for animations
 * - Dots color can be controlled via the text color utility classes
 */
export declare function DotPattern({ width, height, x, y, cx, cy, cr, className, glow, ...props }: DotPatternProps): React.JSX.Element;
export {};
