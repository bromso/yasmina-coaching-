import { type MotionProps, type UseInViewOptions } from "motion/react";
type MarginType = UseInViewOptions["margin"];
interface BlurFadeProps extends MotionProps {
    children: React.ReactNode;
    className?: string;
    variant?: {
        hidden: {
            y: number;
        };
        visible: {
            y: number;
        };
    };
    duration?: number;
    delay?: number;
    offset?: number;
    direction?: "up" | "down" | "left" | "right";
    inView?: boolean;
    inViewMargin?: MarginType;
    blur?: string;
}
export declare function BlurFade({ children, className, variant, duration, delay, offset, direction, inView, inViewMargin, blur, ...props }: BlurFadeProps): import("react").JSX.Element;
export {};
