import { type ReactNode } from "react";
export interface SunburstBreadcrumbItem {
    id: string;
    label: string;
    isCurrent: boolean;
}
export declare function useSunburstBreadcrumbItems(): {
    items: SunburstBreadcrumbItem[];
    zoomTo: (nextId: string) => void;
};
export interface SunburstBreadcrumbProps {
    className?: string;
    children: ReactNode;
}
export declare const SunburstBreadcrumb: import("react").NamedExoticComponent<SunburstBreadcrumbProps>;
