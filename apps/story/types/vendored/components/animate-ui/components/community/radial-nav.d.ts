import * as React from "react";
type RadialNavProps = {
    size?: number;
    items: RadialNavItem[];
    menuButtonConfig?: MenuButtonConfig;
    defaultActiveId?: number;
    onActiveChange?: (id: number) => void;
};
type RadialNavItem = {
    id: number;
    /** Iconify icon name, e.g. "lucide:house" */
    icon: string;
    label: string;
    angle: number;
};
type MenuButtonConfig = {
    iconSize?: number;
    buttonSize?: number;
    buttonPadding?: number;
};
declare function RadialNav({ size, items, menuButtonConfig, defaultActiveId, onActiveChange, }: RadialNavProps): React.JSX.Element;
export { type MenuButtonConfig, RadialNav, type RadialNavItem, type RadialNavProps };
