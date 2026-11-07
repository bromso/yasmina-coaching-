import React from "react";
interface FuzzyTextProps {
    children: React.ReactNode;
    fontSize?: number | string;
    fontWeight?: string | number;
    fontFamily?: string;
    color?: string;
    enableHover?: boolean;
    baseIntensity?: number;
    hoverIntensity?: number;
    fuzzRange?: number;
    fps?: number;
    direction?: "horizontal" | "vertical" | "both";
    transitionDuration?: number;
    clickEffect?: boolean;
    glitchMode?: boolean;
    glitchInterval?: number;
    glitchDuration?: number;
    gradient?: string[] | null;
    letterSpacing?: number;
    className?: string;
}
declare const FuzzyText: React.FC<FuzzyTextProps>;
export default FuzzyText;
