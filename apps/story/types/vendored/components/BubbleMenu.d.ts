import type { CSSProperties, ReactNode } from "react";
type MenuItem = {
    label: string;
    href: string;
    ariaLabel?: string;
    rotation?: number;
    hoverStyles?: {
        bgColor?: string;
        textColor?: string;
    };
};
export type BubbleMenuProps = {
    logo: ReactNode | string;
    onMenuClick?: (open: boolean) => void;
    className?: string;
    style?: CSSProperties;
    menuAriaLabel?: string;
    menuBg?: string;
    menuContentColor?: string;
    useFixedPosition?: boolean;
    items?: MenuItem[];
    animationEase?: string;
    animationDuration?: number;
    staggerDelay?: number;
};
export default function BubbleMenu({ logo, onMenuClick, className, style, menuAriaLabel, menuBg, menuContentColor, useFixedPosition, items, animationEase, animationDuration, staggerDelay, }: BubbleMenuProps): import("react").JSX.Element;
export {};
