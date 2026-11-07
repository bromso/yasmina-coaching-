interface SeriesDashTailOverlayProps {
    dashFromIndex?: number;
    dashArray: string;
    data: Record<string, unknown>[];
    pathD: string | null;
    pathLength: number;
    innerWidth: number;
    innerHeight: number;
    stroke: string;
    strokeWidth: number;
    xScale: (value: Date | number) => number | undefined;
    xAccessor: (datum: Record<string, unknown>) => Date | number;
}
declare function SeriesDashTailOverlayImpl({ dashFromIndex, dashArray, data, pathD, pathLength, innerWidth, innerHeight, stroke, strokeWidth, xScale, xAccessor, }: SeriesDashTailOverlayProps): import("react").JSX.Element | null;
export declare const SeriesDashTailOverlay: import("react").MemoExoticComponent<typeof SeriesDashTailOverlayImpl>;
export {};
