export interface BarYAxisProps {
    /** Whether to show all labels or skip some for dense data. Default: true */
    showAllLabels?: boolean;
    /** Maximum number of labels to show. Default: 20 */
    maxLabels?: number;
}
export declare function BarYAxis(props: BarYAxisProps): import("react").JSX.Element | null;
export declare namespace BarYAxis {
    var displayName: string;
}
export default BarYAxis;
