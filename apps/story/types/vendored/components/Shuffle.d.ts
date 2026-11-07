import React from "react";
export interface ShuffleProps {
    text: string;
    className?: string;
    style?: React.CSSProperties;
    shuffleDirection?: "left" | "right" | "up" | "down";
    duration?: number;
    maxDelay?: number;
    ease?: string | ((t: number) => number);
    threshold?: number;
    rootMargin?: string;
    tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
    textAlign?: React.CSSProperties["textAlign"];
    onShuffleComplete?: () => void;
    shuffleTimes?: number;
    animationMode?: "random" | "evenodd";
    loop?: boolean;
    loopDelay?: number;
    stagger?: number;
    scrambleCharset?: string;
    colorFrom?: string;
    colorTo?: string;
    triggerOnce?: boolean;
    respectReducedMotion?: boolean;
    triggerOnHover?: boolean;
}
declare const Shuffle: React.FC<ShuffleProps>;
export default Shuffle;
