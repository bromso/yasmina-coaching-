export interface SquareColumnLayout {
    /** Number of squares in the column */
    count: number;
    /** Top-left Y of each square, bottom square first (relative to bar top at 0) */
    positions: number[];
    /** Quantized column height in pixels */
    columnHeight: number;
    squareSize: number;
    /** Effective gap between squares (may differ when fit mode redistributes) */
    gap: number;
}
export interface SquareColumnInput {
    /** Raw bar length in pixels (baseline − value) */
    barLengthPx: number;
    /** Square width/height — typically equals bar width */
    squareSize: number;
    /** Gap between stacked squares in pixels */
    gap: number;
    /** When true, redistribute gap so column height matches barLengthPx exactly */
    fit?: boolean;
}
/** Quantize bar length into a stack of square cells. */
export declare function computeSquareColumn({ barLengthPx, squareSize, gap, fit, }: SquareColumnInput): SquareColumnLayout;
/** Y center of the topmost square in a vertical column. */
export declare function topSquareCenterY({ baselineY, barLengthPx, squareSize, gap, fit, }: SquareColumnInput & {
    baselineY: number;
}): number;
