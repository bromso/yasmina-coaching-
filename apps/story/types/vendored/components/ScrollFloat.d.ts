import type React from "react";
import { type ReactNode, type RefObject } from "react";
interface ScrollFloatProps {
    children: ReactNode;
    scrollContainerRef?: RefObject<HTMLElement>;
    containerClassName?: string;
    textClassName?: string;
    animationDuration?: number;
    ease?: string;
    scrollStart?: string;
    scrollEnd?: string;
    stagger?: number;
}
declare const ScrollFloat: React.FC<ScrollFloatProps>;
export default ScrollFloat;
