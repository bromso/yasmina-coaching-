import type { ReactNode } from "react";
export interface TooltipRow {
    color: string;
    label: string;
    value: string | number;
}
export interface TooltipContentProps {
    title?: string;
    rows: TooltipRow[];
    /** Optional additional content (e.g., markers) */
    children?: ReactNode;
}
export declare function TooltipContent({ title, rows, children }: TooltipContentProps): import("react").JSX.Element;
export declare namespace TooltipContent {
    var displayName: string;
}
export default TooltipContent;
