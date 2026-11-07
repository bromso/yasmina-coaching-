export interface CandlestickProps {
    /** Whether to animate the candlesticks. Default: true */
    animate?: boolean;
    /** Fill for positive (close >= open) candles. Color or url(#gradient). Default: emerald */
    positiveFill?: string;
    /** Fill for negative candles. Color or url(#gradient). Default: red */
    negativeFill?: string;
    /** Optional pattern URL for body only (e.g. url(#pattern)). When set, body is drawn solid first, then pattern overlaid and masked to the body rect. */
    bodyPatternPositive?: string;
    /** Optional pattern URL for negative candle body. */
    bodyPatternNegative?: string;
    /** Inner border width on the body (drawn inside so it does not expand the shape). Default: 0 (off). */
    insideStrokeWidth?: number;
    /** Opacity when another candle is hovered. Default: 0.3 */
    fadedOpacity?: number;
    /** Dim non-hovered candles on hover. Default: true */
    showHoverFade?: boolean;
}
export declare function Candlestick({ animate, positiveFill, negativeFill, bodyPatternPositive, bodyPatternNegative, insideStrokeWidth, fadedOpacity, showHoverFade, }: CandlestickProps): import("react").JSX.Element;
export declare namespace Candlestick {
    var displayName: string;
}
export default Candlestick;
