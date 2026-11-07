import { type ReactNode } from "react";
import type { ArcDatum, Focus } from "./sunburst";
export interface SunburstHintContext {
    hintText: string;
    hoveredArc: ArcDatum | null;
    focus: Focus;
}
export interface SunburstHintProps {
    className?: string;
    children?: ReactNode | ((context: SunburstHintContext) => ReactNode);
}
export declare const SunburstHint: import("react").NamedExoticComponent<SunburstHintProps>;
