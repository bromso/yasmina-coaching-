import { type ProjectionCurveKind, type ProjectionPoint } from "./projection-utils";
type CurveFactory = any;
export type ProjectionStrokeStyle = "solid" | "gradient";
export interface ProjectionLineProps {
    /** Projection path points — anchor (last data row) + horizon end. */
    data: ProjectionPoint[];
    /** Y-scale group id. Default: `"left"`. */
    yAxisId?: string | number;
    /** Solid stroke color. Default: var(--chart-3) */
    stroke?: string;
    /** Solid or path-aligned gradient stroke. Default: solid */
    strokeStyle?: ProjectionStrokeStyle;
    /** Gradient start color when `strokeStyle` is gradient. Default: `stroke` */
    gradientStart?: string;
    /** Gradient end color when `strokeStyle` is gradient. Default: var(--chart-5) */
    gradientEnd?: string;
    /** Stroke width. Default: 2 */
    strokeWidth?: number;
    /** Straight segment or horizontal-tangent S-curve. Default: linear */
    curveKind?: ProjectionCurveKind;
    /** Advanced curve override (used when `curveKind` is omitted). */
    curve?: CurveFactory;
    /** Dash pattern. Default: "6,4" */
    strokeDasharray?: string;
    /** Stroke opacity. Default: 1 */
    strokeOpacity?: number;
    /** Show horizon endpoint marker. Default: true */
    showEndMarker?: boolean;
    /** @deprecated Use `showEndMarker`. */
    showEndpoints?: boolean;
    /** Endpoint marker radius. Default: 5 */
    endpointRadius?: number;
    className?: string;
}
export declare function ProjectionLine({ data, yAxisId, stroke, strokeStyle, gradientStart, gradientEnd, strokeWidth, curveKind, curve, strokeDasharray, strokeOpacity, showEndMarker, showEndpoints, endpointRadius, className, }: ProjectionLineProps): import("react").JSX.Element | null;
export declare namespace ProjectionLine {
    var displayName: string;
}
export default ProjectionLine;
