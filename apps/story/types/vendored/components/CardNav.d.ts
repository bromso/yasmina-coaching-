import type React from "react";
type CardNavLink = {
    label: string;
    href: string;
    ariaLabel: string;
};
export type CardNavItem = {
    label: string;
    bgColor: string;
    textColor: string;
    links: CardNavLink[];
};
export interface CardNavProps {
    logo: string;
    logoAlt?: string;
    items: CardNavItem[];
    className?: string;
    ease?: string;
    baseColor?: string;
    menuColor?: string;
    buttonBgColor?: string;
    buttonTextColor?: string;
}
declare const CardNav: React.FC<CardNavProps>;
export default CardNav;
