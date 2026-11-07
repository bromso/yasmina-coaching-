import type React from "react";
interface AnimatedContentProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    container?: Element | string | null;
    distance?: number;
    direction?: "vertical" | "horizontal";
    reverse?: boolean;
    duration?: number;
    ease?: string;
    initialOpacity?: number;
    animateOpacity?: boolean;
    scale?: number;
    threshold?: number;
    delay?: number;
    disappearAfter?: number;
    disappearDuration?: number;
    disappearEase?: string;
    onComplete?: () => void;
    onDisappearanceComplete?: () => void;
}
declare const AnimatedContent: React.FC<AnimatedContentProps>;
export default AnimatedContent;
