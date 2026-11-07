export interface BarXAxisProps {
    /** Width of the date ticker box for fade calculation. Default: 50 */
    tickerHalfWidth?: number;
    /** Whether to show all labels or skip some for dense data. Default: false */
    showAllLabels?: boolean;
    /** Maximum number of labels to show. Default: 12 */
    maxLabels?: number;
}
export declare function BarXAxis(props: BarXAxisProps): import("react").JSX.Element | null;
export declare namespace BarXAxis {
    var displayName: string;
}
export default BarXAxis;
