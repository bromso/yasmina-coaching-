import type React from "react";
import { type CSSProperties } from "react";
interface PixelTransitionProps {
    firstContent: React.ReactNode | string;
    secondContent: React.ReactNode | string;
    gridSize?: number;
    pixelColor?: string;
    animationStepDuration?: number;
    once?: boolean;
    className?: string;
    style?: CSSProperties;
    aspectRatio?: string;
}
declare const PixelTransition: React.FC<PixelTransitionProps>;
export default PixelTransition;
