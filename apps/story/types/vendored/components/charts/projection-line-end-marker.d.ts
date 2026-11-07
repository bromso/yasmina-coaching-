import type { ProjectionPoint } from "./projection-utils";
export interface ProjectionLineEndMarkerProps {
    data: ProjectionPoint[];
    yAxisId?: string | number;
    stroke?: string;
    strokeOpacity?: number;
    radius?: number;
}
/** Renders the projection horizon dot outside the series reveal clip. */
export declare function ProjectionLineEndMarker({ data, yAxisId, stroke, strokeOpacity, radius, }: ProjectionLineEndMarkerProps): import("react").JSX.Element | null;
export declare namespace ProjectionLineEndMarker {
    var displayName: string;
}
export default ProjectionLineEndMarker;
