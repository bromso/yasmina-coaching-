import type React from "react";
import type { ReactNode } from "react";
export interface ScrollStackItemProps {
    itemClassName?: string;
    children: ReactNode;
}
export declare const ScrollStackItem: React.FC<ScrollStackItemProps>;
interface ScrollStackProps {
    className?: string;
    children: ReactNode;
    itemDistance?: number;
    itemScale?: number;
    itemStackDistance?: number;
    stackPosition?: string;
    scaleEndPosition?: string;
    baseScale?: number;
    rotationAmount?: number;
    blurAmount?: number;
    useWindowScroll?: boolean;
    onStackComplete?: () => void;
}
declare const ScrollStack: React.FC<ScrollStackProps>;
export default ScrollStack;
