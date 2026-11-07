import { type ReactNode } from "react";
/** Disables cartesian reveal clip-path for static docs previews. */
export declare function StaticChartPreviewProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useStaticChartPreview(): boolean;
