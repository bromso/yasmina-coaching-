import type { ReactNode } from "react";
export interface LegendItemProps {
    /** Container class name */
    className?: string;
    /** Children components (LegendMarker, LegendLabel, LegendValue, LegendProgress) */
    children: ReactNode;
}
export declare function LegendItem({ className, children }: LegendItemProps): import("react").JSX.Element;
export declare namespace LegendItem {
    var displayName: string;
}
