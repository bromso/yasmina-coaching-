import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import type { SunburstNode } from "./sunburst-data";
export type { ArcDatum, Focus } from "./sunburst";
export type { SunburstNode } from "./sunburst-data";
export interface SunburstChartProps {
    data: SunburstNode;
    size?: number;
    /** Bump to replay the initialization animation. */
    playKey?: number;
    className?: string;
    /** Controlled focus node id for drill-down. */
    focusId?: string;
    /** Called when focus changes via segment click or breadcrumb. */
    onFocusChange?: (focusId: string) => void;
    /** Controlled hover — arc index in the arcs array. */
    hoveredIndex?: number | null;
    onHoverChange?: (index: number | null) => void;
    hoverPop?: number;
    /** Inset reserved for hover growth; defaults from layout depth and hoverPop. */
    padding?: number;
    enterTransition?: Transition;
    enterStaggerScale?: number;
    children: ReactNode;
}
export declare function SunburstChart(props: SunburstChartProps): import("react").JSX.Element;
export declare namespace SunburstChart {
    var displayName: string;
}
