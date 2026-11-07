import type React from "react";
interface MenuItemData {
    link: string;
    text: string;
    image: string;
}
interface FlowingMenuProps {
    items?: MenuItemData[];
    speed?: number;
    textColor?: string;
    bgColor?: string;
    marqueeBgColor?: string;
    marqueeTextColor?: string;
    borderColor?: string;
}
declare const FlowingMenu: React.FC<FlowingMenuProps>;
export default FlowingMenu;
