import type React from "react";
interface Item {
    id: string;
    img: string;
    url: string;
    height: number;
}
interface MasonryProps {
    items: Item[];
    ease?: string;
    duration?: number;
    stagger?: number;
    animateFrom?: "bottom" | "top" | "left" | "right" | "center" | "random";
    scaleOnHover?: boolean;
    hoverScale?: number;
    blurToFocus?: boolean;
    colorShiftOnHover?: boolean;
}
declare const Masonry: React.FC<MasonryProps>;
export default Masonry;
