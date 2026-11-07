import React from "react";
export interface StaggeredMenuItem {
    label: string;
    ariaLabel: string;
    link: string;
}
export interface StaggeredMenuSocialItem {
    label: string;
    link: string;
}
export interface StaggeredMenuProps {
    position?: "left" | "right";
    colors?: string[];
    items?: StaggeredMenuItem[];
    socialItems?: StaggeredMenuSocialItem[];
    displaySocials?: boolean;
    displayItemNumbering?: boolean;
    className?: string;
    logoUrl?: string;
    menuButtonColor?: string;
    openMenuButtonColor?: string;
    accentColor?: string;
    isFixed: boolean;
    changeMenuColorOnOpen?: boolean;
    closeOnClickAway?: boolean;
    onMenuOpen?: () => void;
    onMenuClose?: () => void;
}
export declare const StaggeredMenu: React.FC<StaggeredMenuProps>;
export default StaggeredMenu;
