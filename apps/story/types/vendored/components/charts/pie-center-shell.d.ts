import { type PieCenterProps } from "./pie-center";
export type PieCenterShellProps = Omit<PieCenterProps, "children"> & {
    /** Value shown with NumberFlow (same role as pie total when not hovering) */
    centerValue: number;
    /** Square reference size for pie context (matches `PieChart` `size`) */
    contextSize: number;
    /** Inner radius in px — must be > 0 so `PieCenter` renders */
    innerRadiusPx: number;
    /**
     * When true (default), the first paint uses `0` then updates to `centerValue`
     * on the next frame so NumberFlow can run an entrance transition. Subsequent
     * `centerValue` updates animate as usual.
     */
    animateEntrance?: boolean;
};
/**
 * Renders {@link PieCenter} with a minimal {@link PieProvider} so you can reuse
 * the same center layout as a donut pie without mounting slices or a full {@link PieChart}.
 */
export declare function PieCenterShell({ centerValue, contextSize, innerRadiusPx, animateEntrance, ...pieCenterProps }: PieCenterShellProps): import("react").JSX.Element;
export declare namespace PieCenterShell {
    var displayName: string;
}
