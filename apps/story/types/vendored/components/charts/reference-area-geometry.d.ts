export type ReferenceAreaIfOverflow = "hidden" | "visible" | "discard";
export interface ReferenceAreaRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface ComputeReferenceAreaRectOptions {
    innerWidth: number;
    innerHeight: number;
    x1?: Date | number;
    x2?: Date | number;
    y1?: number;
    y2?: number;
    ifOverflow?: ReferenceAreaIfOverflow;
    xScale: (value: Date) => number;
    yScale: (value: number) => number;
}
/** Map data bounds to plot pixels for a reference rectangle. */
export declare function computeReferenceAreaRect(options: ComputeReferenceAreaRectOptions): ReferenceAreaRect | null;
/** Inclusive data range for axis label highlighting. */
export declare function resolveReferenceDataRange(y1: number | undefined, y2: number | undefined, domain: [number, number]): [number, number];
