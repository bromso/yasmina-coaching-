import { type Easing } from "motion/react";
type BlurTextProps = {
    text?: string;
    delay?: number;
    className?: string;
    animateBy?: "words" | "letters";
    direction?: "top" | "bottom";
    threshold?: number;
    rootMargin?: string;
    animationFrom?: Record<string, string | number>;
    animationTo?: Array<Record<string, string | number>>;
    easing?: Easing | Easing[];
    onAnimationComplete?: () => void;
    stepDuration?: number;
};
declare const BlurText: React.FC<BlurTextProps>;
export default BlurText;
