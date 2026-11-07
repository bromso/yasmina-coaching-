/** Hover effect types */
export type PieSliceHoverEffect = "translate" | "grow" | "none";
export interface PieSliceProps {
    /** Index of the slice in the data array */
    index: number;
    /** Optional color override - falls back to data color or palette */
    color?: string;
    /** Optional fill override for patterns/gradients (e.g., "url(#patternId)") */
    fill?: string;
    /** Animate the slice on mount. Default: true */
    animate?: boolean;
    /** Show glow effect on hover. Default: true */
    showGlow?: boolean;
    /**
     * Hover effect type. Default: "translate"
     * - "translate": Slice moves outward along its radial axis
     * - "grow": Slice extends its outer radius (gets longer)
     * - "none": No hover animation
     */
    hoverEffect?: PieSliceHoverEffect;
    /** Distance in pixels for hover effect (translate distance or grow amount). Defaults to PieChart's hoverOffset */
    hoverOffset?: number;
    /** Additional CSS class */
    className?: string;
}
export declare const PieSlice: import("react").NamedExoticComponent<PieSliceProps>;
export default PieSlice;
