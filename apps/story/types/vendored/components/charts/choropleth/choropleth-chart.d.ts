import type { TransformMatrix } from "@visx/zoom";
import type { FeatureCollection, Geometry } from "geojson";
import type { Transition } from "motion/react";
import React, { type ReactNode } from "react";
import { type ChoroplethFeatureProperties, type Margin } from "./choropleth-context";
export interface ChoroplethChartProps {
    /** GeoJSON FeatureCollection data */
    data: FeatureCollection<Geometry, ChoroplethFeatureProperties>;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Animation duration in milliseconds. Default: 800 */
    animationDuration?: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers enter replay when it changes. */
    revealSignature?: string;
    /** Aspect ratio as "width / height". Default: "16 / 9" */
    aspectRatio?: string;
    /** Projection scale. If not provided, auto-calculated based on width */
    scale?: number;
    /** Center coordinates [longitude, latitude]. Default: [0, 20] */
    center?: [number, number];
    /** Translate offset [x, y]. If not provided, auto-calculated to center */
    translate?: [number, number];
    /** Enable zoom and pan. Default: false */
    zoomEnabled?: boolean;
    /** Minimum zoom scale. Default: 0.5 */
    zoomMin?: number;
    /** Maximum zoom scale. Default: 4 */
    zoomMax?: number;
    /** Initial zoom transform */
    initialZoom?: TransformMatrix;
    /** Additional class name for the container */
    className?: string;
    /** Child components (ChoroplethFeature, ChoroplethGraticule, ChoroplethTooltip) */
    children: ReactNode;
}
export declare function ChoroplethChart({ data, margin: marginProp, animationDuration, enterTransition, revealSignature, aspectRatio, scale, center, translate, zoomEnabled, zoomMin, zoomMax, initialZoom, className, children, }: ChoroplethChartProps): React.JSX.Element;
export declare namespace ChoroplethChart {
    var displayName: string;
}
export default ChoroplethChart;
