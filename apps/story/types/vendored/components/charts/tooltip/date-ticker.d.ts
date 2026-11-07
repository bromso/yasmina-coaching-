export interface DateTickerProps {
    currentIndex: number;
    labels: string[];
    visible: boolean;
}
export declare function DateTicker({ currentIndex, labels, visible }: DateTickerProps): import("react").JSX.Element | null;
export declare namespace DateTicker {
    var displayName: string;
}
export default DateTicker;
