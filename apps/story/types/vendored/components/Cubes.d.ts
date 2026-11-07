import type React from "react";
interface Gap {
    row: number;
    col: number;
}
interface Duration {
    enter: number;
    leave: number;
}
export interface CubesProps {
    gridSize?: number;
    cubeSize?: number;
    maxAngle?: number;
    radius?: number;
    easing?: gsap.EaseString;
    duration?: Duration;
    cellGap?: number | Gap;
    borderStyle?: string;
    faceColor?: string;
    shadow?: boolean | string;
    autoAnimate?: boolean;
    rippleOnClick?: boolean;
    rippleColor?: string;
    rippleSpeed?: number;
}
declare const Cubes: React.FC<CubesProps>;
export default Cubes;
