import { type CanvasProps } from "@react-three/fiber";
import type React from "react";
interface PixelTrailProps {
    gridSize?: number;
    trailSize?: number;
    maxAge?: number;
    interpolate?: number;
    easingFunction?: (x: number) => number;
    canvasProps?: Partial<CanvasProps>;
    glProps?: WebGLContextAttributes & {
        powerPreference?: string;
    };
    gooeyFilter?: {
        id: string;
        strength: number;
    };
    color?: string;
    className?: string;
}
export default function PixelTrail({ gridSize, trailSize, maxAge, interpolate, easingFunction, canvasProps, glProps, gooeyFilter, color, className, }: PixelTrailProps): React.JSX.Element;
export {};
