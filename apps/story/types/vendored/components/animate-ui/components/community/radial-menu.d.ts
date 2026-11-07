import * as React from "react";
type RadialMenuProps = {
    children?: React.ReactNode;
    menuItems: MenuItem[];
    size?: number;
    iconSize?: number;
    bandWidth?: number;
    innerGap?: number;
    outerGap?: number;
    outerRingWidth?: number;
    onSelect?: (item: MenuItem) => void;
};
type MenuItem = {
    id: number;
    label: string;
    /** Iconify icon name, e.g. "lucide:house" */
    icon: string;
};
declare function RadialMenu({ children, menuItems, size, iconSize, bandWidth, innerGap, outerGap, outerRingWidth, onSelect, }: RadialMenuProps): React.JSX.Element;
export { RadialMenu };
